(() => {
  "use strict";

  const STORAGE_KEY = "fluxline-kanban-store";
  const SCHEMA_VERSION = 1;
  const STATUSES = ["backlog", "in-progress", "done"];
  const PRIORITIES = ["low", "medium", "high"];
  const desktopMedia = window.matchMedia("(min-width: 1024px)");

  const state = {
    tasks: [],
    search: "",
    filters: {
      priority: "all",
      due: "all",
      tags: []
    },
    theme: "light",
    sortables: [],
    ui: {
      loading: true,
      activeModal: null,
      editingTaskId: null,
      selectedTaskId: null,
      draftSubtasks: [],
      lastFocusedElement: null
    }
  };

  const dom = {
    appRoot: document.querySelector("#appRoot"),
    boardLoading: document.querySelector("#boardLoading"),
    board: document.querySelector(".board"),
    searchInput: document.querySelector("#searchInput"),

    themeToggle: document.querySelector("#themeToggle"),
    openFiltersBtn: document.querySelector("#openFiltersBtn"),
    fabTask: document.querySelector("#fabTask"),

    taskModal: document.querySelector("#taskModal"),
    taskModalClose: Array.from(document.querySelectorAll("[data-close-modal='task']")),
    taskModalTitle: document.querySelector("#taskModalTitle"),
    taskForm: document.querySelector("#taskForm"),
    taskId: document.querySelector("#taskId"),
    taskTitle: document.querySelector("#taskTitle"),
    taskDescription: document.querySelector("#taskDescription"),
    taskPriority: document.querySelector("#taskPriority"),
    taskDueDate: document.querySelector("#taskDueDate"),
    taskStatus: document.querySelector("#taskStatus"),
    taskTags: document.querySelector("#taskTags"),
    subtaskInput: document.querySelector("#subtaskInput"),
    addSubtaskBtn: document.querySelector("#addSubtaskBtn"),
    subtaskDraftList: document.querySelector("#subtaskDraftList"),
    deleteTaskBtn: document.querySelector("#deleteTaskBtn"),

    filtersSheet: document.querySelector("#filtersSheet"),
    filtersSheetClose: Array.from(document.querySelectorAll("[data-close-modal='filters']")),
    filterPriority: document.querySelector("#filterPriority"),
    filterDue: document.querySelector("#filterDue"),
    filterTags: document.querySelector("#filterTags"),
    applyFiltersBtn: document.querySelector("#applyFiltersBtn"),
    clearFiltersBtn: document.querySelector("#clearFiltersBtn"),

    lanes: {
      backlog: document.querySelector("#lane-backlog"),
      "in-progress": document.querySelector("#lane-in-progress"),
      done: document.querySelector("#lane-done")
    },
    counts: {
      backlog: document.querySelector("#count-backlog"),
      "in-progress": document.querySelector("#count-in-progress"),
      done: document.querySelector("#count-done")
    },
    emptyStates: Array.from(document.querySelectorAll(".empty-state")),

    toastRegion: document.querySelector("#toastRegion")
  };

  init();

  function init() {
    hydrate();
    bindEvents();
    applyTheme(state.theme, false);
    syncFilterControls();
    syncFiltersSheetMode();
    initSortables();

    renderBoardWithLoading();
  }

  function hydrate() {
    const fallbackStore = {
      version: SCHEMA_VERSION,
      theme: getSystemTheme(),
      ui: {
        search: "",
        filters: {
          priority: "all",
          due: "all",
          tags: []
        }
      },
      tasks: []
    };

    let rawStore = null;

    try {
      rawStore = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (_error) {
      pushToast("Stored data was invalid. Started with a clean board.", "error");
    }

    const store = migrateStore(rawStore, fallbackStore);
    state.tasks = sanitizeTasks(store.tasks || []);
    state.theme = normalizeTheme(store.theme, fallbackStore.theme);
    state.search = typeof store.ui?.search === "string" ? store.ui.search : "";
    state.filters = normalizeFilters(store.ui?.filters);
    normalizeOrders();
    saveStore();
  }

  function migrateStore(rawStore, fallbackStore) {
    if (!rawStore) {
      return fallbackStore;
    }

    if (Array.isArray(rawStore)) {
      return {
        ...fallbackStore,
        tasks: rawStore
      };
    }

    if (typeof rawStore !== "object") {
      return fallbackStore;
    }

    if (rawStore.version === SCHEMA_VERSION) {
      return {
        version: SCHEMA_VERSION,
        theme: normalizeTheme(rawStore.theme, fallbackStore.theme),
        ui: {
          search: typeof rawStore.ui?.search === "string" ? rawStore.ui.search : "",
          filters: normalizeFilters(rawStore.ui?.filters)
        },
        tasks: Array.isArray(rawStore.tasks) ? rawStore.tasks : []
      };
    }

    if (rawStore.version === 0 || typeof rawStore.version === "undefined") {
      const tasks = Array.isArray(rawStore.tasks) ? rawStore.tasks : [];
      return {
        version: SCHEMA_VERSION,
        theme: normalizeTheme(rawStore.theme, fallbackStore.theme),
        ui: {
          search: typeof rawStore.search === "string" ? rawStore.search : "",
          filters: normalizeFilters(rawStore.filters)
        },
        tasks
      };
    }

    return fallbackStore;
  }

  function normalizeFilters(rawFilters) {
    return {
      priority: ["all", ...PRIORITIES].includes(rawFilters?.priority) ? rawFilters.priority : "all",
      due: ["all", "overdue", "week"].includes(rawFilters?.due) ? rawFilters.due : "all",
      tags: normalizeTagList(rawFilters?.tags || [])
    };
  }

  function normalizeTheme(value, fallback) {
    if (value === "light" || value === "dark") {
      return value;
    }

    return fallback;
  }

  function sanitizeTasks(rawTasks) {
    const now = new Date().toISOString();

    return rawTasks
      .map((task, index) => {
        if (!task || typeof task !== "object") {
          return null;
        }

        const title = typeof task.title === "string" ? task.title.trim() : "";

        if (!title) {
          return null;
        }

        const subtasks = Array.isArray(task.subtasks)
          ? task.subtasks
              .map((subtask) => {
                const text = typeof subtask?.text === "string" ? subtask.text.trim() : "";

                if (!text) {
                  return null;
                }

                return {
                  id: typeof subtask.id === "string" ? subtask.id : createId("subtask"),
                  text,
                  done: Boolean(subtask.done)
                };
              })
              .filter(Boolean)
          : [];

        return {
          id: typeof task.id === "string" ? task.id : createId("task"),
          title,
          description: typeof task.description === "string" ? task.description.trim() : "",
          priority: PRIORITIES.includes(task.priority) ? task.priority : "medium",
          dueDate: normalizeDueDate(task.dueDate),
          tags: normalizeTagList(task.tags),
          subtasks,
          status: STATUSES.includes(task.status) ? task.status : "backlog",
          order: Number.isFinite(Number(task.order)) ? Number(task.order) : index + 1,
          createdAt: isValidDate(task.createdAt) ? task.createdAt : now,
          updatedAt: isValidDate(task.updatedAt) ? task.updatedAt : now
        };
      })
      .filter(Boolean);
  }

  function normalizeOrders() {
    STATUSES.forEach((status) => {
      const tasks = state.tasks
        .filter((task) => task.status === status)
        .sort((a, b) => Number(a.order) - Number(b.order));

      tasks.forEach((task, index) => {
        task.order = index + 1;
      });
    });
  }

  function saveStore() {
    const payload = {
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      theme: state.theme,
      ui: {
        search: state.search,
        filters: state.filters
      },
      tasks: state.tasks
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function bindEvents() {
    dom.searchInput.addEventListener("input", (event) => {
      state.search = event.target.value.trim().toLowerCase();
      saveStore();
      renderBoard();
    });

    dom.themeToggle.addEventListener("click", () => {
      const nextTheme = state.theme === "dark" ? "light" : "dark";
      applyTheme(nextTheme, true);
      pushToast(`Theme set to ${nextTheme}.`);
    });

    dom.openFiltersBtn.addEventListener("click", () => {
      openFiltersSheet();
    });

    dom.fabTask.addEventListener("click", () => {
      openTaskModal();
    });

    dom.taskModalClose.forEach((button) => {
      button.addEventListener("click", closeTaskModal);
    });

    dom.filtersSheetClose.forEach((button) => {
      button.addEventListener("click", closeFiltersSheet);
    });

    dom.applyFiltersBtn.addEventListener("click", () => {
      state.filters.priority = dom.filterPriority.value;
      state.filters.due = dom.filterDue.value;
      state.filters.tags = normalizeTagList(dom.filterTags.value);

      saveStore();
      renderBoard();

      if (!desktopMedia.matches) {
        closeFiltersSheet();
      }

      pushToast("Filters applied.");
    });

    dom.clearFiltersBtn.addEventListener("click", () => {
      state.filters = {
        priority: "all",
        due: "all",
        tags: []
      };

      state.search = "";
      syncFilterControls();
      saveStore();
      renderBoard();
      pushToast("Search and filters reset.");
    });

    dom.taskForm.addEventListener("submit", handleTaskSubmit);

    dom.addSubtaskBtn.addEventListener("click", () => {
      addDraftSubtask();
    });

    dom.subtaskInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addDraftSubtask();
      }
    });

    dom.subtaskDraftList.addEventListener("click", (event) => {
      const removeButton = event.target.closest("button[data-remove-subtask]");

      if (!removeButton) {
        return;
      }

      const subtaskId = removeButton.getAttribute("data-remove-subtask");
      state.ui.draftSubtasks = state.ui.draftSubtasks.filter((item) => item.id !== subtaskId);
      renderDraftSubtasks();
    });

    dom.subtaskDraftList.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[data-toggle-subtask]");

      if (!checkbox) {
        return;
      }

      const subtaskId = checkbox.getAttribute("data-toggle-subtask");
      const subtask = state.ui.draftSubtasks.find((item) => item.id === subtaskId);

      if (!subtask) {
        return;
      }

      subtask.done = checkbox.checked;
    });

    dom.deleteTaskBtn.addEventListener("click", () => {
      if (!state.ui.editingTaskId) {
        return;
      }

      const task = state.tasks.find((item) => item.id === state.ui.editingTaskId);

      if (!task) {
        return;
      }

      const ok = window.confirm(`Delete task "${task.title}"?`);

      if (!ok) {
        return;
      }

      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      state.ui.editingTaskId = null;
      normalizeOrders();
      saveStore();
      renderBoard();
      closeTaskModal();
      pushToast("Task deleted.");
    });

    dom.board.addEventListener("click", (event) => {
      const moveButton = event.target.closest("button[data-move]");

      if (moveButton) {
        const taskId = moveButton.getAttribute("data-task-id");
        const direction = moveButton.getAttribute("data-move") === "left" ? -1 : 1;
        moveTaskByStep(taskId, direction);
        return;
      }

      const editButton = event.target.closest("button[data-edit-task]");

      if (editButton) {
        const taskId = editButton.getAttribute("data-edit-task");
        openTaskModal(taskId);
        return;
      }

      const card = event.target.closest(".task-card");

      if (card) {
        const taskId = card.getAttribute("data-task-id");
        state.ui.selectedTaskId = taskId;
        renderSelection();
      }
    });

    dom.board.addEventListener("focusin", (event) => {
      const card = event.target.closest(".task-card");

      if (!card) {
        return;
      }

      state.ui.selectedTaskId = card.getAttribute("data-task-id");
      renderSelection();
    });

    dom.board.addEventListener("keydown", (event) => {
      const card = event.target.closest(".task-card");

      if (!card) {
        return;
      }

      const taskId = card.getAttribute("data-task-id");

      if ((event.altKey && event.key === "ArrowLeft") || event.key === "[") {
        event.preventDefault();
        moveTaskByStep(taskId, -1);
        return;
      }

      if ((event.altKey && event.key === "ArrowRight") || event.key === "]") {
        event.preventDefault();
        moveTaskByStep(taskId, 1);
        return;
      }

      if (event.key === "Enter") {
        const withinButton = event.target.closest("button");

        if (!withinButton) {
          event.preventDefault();
          openTaskModal(taskId);
        }
      }
    });

    if (typeof desktopMedia.addEventListener === "function") {
      desktopMedia.addEventListener("change", syncFiltersSheetMode);
    } else if (typeof desktopMedia.addListener === "function") {
      desktopMedia.addListener(syncFiltersSheetMode);
    }

    document.addEventListener("keydown", handleGlobalKeys);
  }

  function initSortables() {
    if (typeof window.Sortable !== "function") {
      pushToast("SortableJS failed to load. Drag and drop is unavailable.", "error");
      return;
    }

    state.sortables = STATUSES.map((status) => {
      return new Sortable(dom.lanes[status], {
        group: "fluxline-kanban",
        animation: 160,
        ghostClass: "drag-ghost",
        dragClass: "drag-active",
        onEnd: handleDragEnd
      });
    });

    updateSortables();
  }

  function updateSortables() {
    const disabled = hasActiveFiltersOrSearch();

    state.sortables.forEach((sortable) => {
      sortable.option("disabled", disabled);
    });
  }

  function handleDragEnd(event) {
    if (hasActiveFiltersOrSearch()) {
      renderBoard();
      pushToast("Clear search/filters to drag tasks.", "error");
      return;
    }

    const taskId = event.item?.getAttribute("data-task-id");

    if (!taskId) {
      return;
    }

    const task = state.tasks.find((item) => item.id === taskId);

    if (!task) {
      return;
    }

    const nextLane = event.to.closest("[data-status]");
    const nextStatus = nextLane?.getAttribute("data-status");

    if (!STATUSES.includes(nextStatus)) {
      renderBoard();
      return;
    }

    task.status = nextStatus;
    task.updatedAt = new Date().toISOString();
    syncOrderFromDom();
    saveStore();
    renderBoard();
  }

  function syncOrderFromDom() {
    STATUSES.forEach((status) => {
      const cards = Array.from(dom.lanes[status].querySelectorAll(".task-card"));

      cards.forEach((card, index) => {
        const taskId = card.getAttribute("data-task-id");
        const task = state.tasks.find((item) => item.id === taskId);

        if (task) {
          task.order = index + 1;
        }
      });
    });

    normalizeOrders();
  }

  function renderBoardWithLoading() {
    dom.board.hidden = true;
    dom.boardLoading.hidden = false;

    window.setTimeout(() => {
      state.ui.loading = false;
      dom.boardLoading.hidden = true;
      dom.board.hidden = false;
      syncFilterControls();
      renderBoard();
    }, 220);
  }

  function renderBoard() {
    const visible = {
      backlog: [],
      "in-progress": [],
      done: []
    };

    STATUSES.forEach((status) => {
      dom.lanes[status].innerHTML = "";
    });

    state.tasks
      .slice()
      .sort((a, b) => {
        if (a.status !== b.status) {
          return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
        }

        return Number(a.order) - Number(b.order);
      })
      .forEach((task) => {
        if (!matchesAllFilters(task)) {
          return;
        }

        visible[task.status].push(task);
      });

    STATUSES.forEach((status) => {
      visible[status].forEach((task) => {
        dom.lanes[status].append(createTaskCard(task));
      });

      dom.counts[status].textContent = String(visible[status].length);

      const emptyState = dom.emptyStates.find((node) => node.getAttribute("data-empty") === status);
      emptyState.classList.toggle("hidden", visible[status].length > 0);
    });

    updateSortables();
    renderSelection();
  }

  function createTaskCard(task) {
    const item = document.createElement("li");
    const overdue = isTaskOverdue(task);
    const completedCount = task.subtasks.filter((s) => s.done).length;
    const subtaskCount = task.subtasks.length;
    const progress = subtaskCount ? Math.round((completedCount / subtaskCount) * 100) : 0;

    item.className = "task-card";
    item.setAttribute("tabindex", "0");
    item.setAttribute("role", "listitem");
    item.setAttribute("data-task-id", task.id);
    item.setAttribute("data-overdue", String(overdue));

    const dueChip = task.dueDate
      ? `<span class="chip ${overdue ? "overdue" : ""}">${escapeHtml(formatDueLabel(task.dueDate))}</span>`
      : `<span class="chip">No due date</span>`;

    const description = task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : "";

    const tags = task.tags.length
      ? `<div class="tag-row">${task.tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("")}</div>`
      : "";

    const subtaskHtml = subtaskCount
      ? `<div class="subtask-progress"><p>${completedCount}/${subtaskCount} subtasks</p><div class="progress-track"><span style="width:${progress}%"></span></div></div>`
      : "";

    const statusIndex = STATUSES.indexOf(task.status);
    const disableLeft = statusIndex === 0 ? "disabled" : "";
    const disableRight = statusIndex === STATUSES.length - 1 ? "disabled" : "";

    item.innerHTML = `
      <div class="task-head">
        <p class="task-title">${escapeHtml(task.title)}</p>
        <span class="priority-pill ${task.priority}">${task.priority}</span>
      </div>
      ${description}
      <div class="task-meta">
        ${dueChip}
        <span class="chip">Updated ${escapeHtml(formatDate(task.updatedAt))}</span>
      </div>
      ${tags}
      ${subtaskHtml}
      <div class="task-actions">
        <button type="button" class="move-btn" data-move="left" data-task-id="${escapeHtml(task.id)}" aria-label="Move task left" ${disableLeft}>◀</button>
        <button type="button" class="move-btn" data-move="right" data-task-id="${escapeHtml(task.id)}" aria-label="Move task right" ${disableRight}>▶</button>
        <button type="button" class="edit-btn" data-edit-task="${escapeHtml(task.id)}" aria-label="Edit task">Edit</button>
      </div>
    `;

    return item;
  }

  function renderSelection() {
    const cards = Array.from(dom.board.querySelectorAll(".task-card"));

    cards.forEach((card) => {
      const taskId = card.getAttribute("data-task-id");
      card.classList.toggle("selected", taskId === state.ui.selectedTaskId);
    });
  }

  function moveTaskByStep(taskId, step) {
    const task = state.tasks.find((item) => item.id === taskId);

    if (!task) {
      return;
    }

    const currentIndex = STATUSES.indexOf(task.status);
    const nextIndex = currentIndex + step;

    if (nextIndex < 0 || nextIndex >= STATUSES.length) {
      pushToast("Task cannot move further.");
      return;
    }

    task.status = STATUSES[nextIndex];
    task.order = getNextOrder(task.status);
    task.updatedAt = new Date().toISOString();
    normalizeOrders();
    saveStore();
    renderBoard();
    focusTaskCard(task.id);
  }

  function focusTaskCard(taskId) {
    state.ui.selectedTaskId = taskId;
    window.requestAnimationFrame(() => {
      const card = dom.board.querySelector(`.task-card[data-task-id="${cssEscape(taskId)}"]`);

      if (card) {
        card.focus();
      }
    });
  }

  function openTaskModal(taskId = null) {
    state.ui.editingTaskId = taskId;
    state.ui.draftSubtasks = [];

    if (taskId) {
      const task = state.tasks.find((item) => item.id === taskId);

      if (!task) {
        pushToast("Task not found.", "error");
        return;
      }

      dom.taskModalTitle.textContent = "Edit Task";
      dom.taskId.value = task.id;
      dom.taskTitle.value = task.title;
      dom.taskDescription.value = task.description;
      dom.taskPriority.value = task.priority;
      dom.taskDueDate.value = task.dueDate;
      dom.taskStatus.value = task.status;
      dom.taskTags.value = task.tags.join(", ");
      dom.deleteTaskBtn.hidden = false;
      state.ui.draftSubtasks = task.subtasks.map((subtask) => ({ ...subtask }));
    } else {
      dom.taskModalTitle.textContent = "New Task";
      dom.taskForm.reset();
      dom.taskId.value = "";
      dom.taskPriority.value = "medium";
      dom.taskStatus.value = "backlog";
      dom.deleteTaskBtn.hidden = true;
    }

    renderDraftSubtasks();
    openDialog(dom.taskModal, "task", dom.taskTitle);
  }

  function closeTaskModal(restoreFocus = true) {
    closeDialog(dom.taskModal, "task", restoreFocus);
    dom.taskForm.reset();
    state.ui.editingTaskId = null;
    state.ui.draftSubtasks = [];
  }

  function openFiltersSheet() {
    if (desktopMedia.matches) {
      dom.filtersSheet.hidden = false;
      return;
    }

    openDialog(dom.filtersSheet, "filters", dom.filterPriority);
    dom.openFiltersBtn.setAttribute("aria-expanded", "true");
  }

  function closeFiltersSheet() {
    if (desktopMedia.matches) {
      dom.filtersSheet.hidden = false;
      dom.openFiltersBtn.setAttribute("aria-expanded", "false");
      return;
    }

    closeDialog(dom.filtersSheet, "filters");
    dom.openFiltersBtn.setAttribute("aria-expanded", "false");
  }

  function syncFiltersSheetMode() {
    if (desktopMedia.matches) {
      dom.filtersSheet.hidden = false;
      dom.openFiltersBtn.setAttribute("aria-expanded", "false");
      if (state.ui.activeModal === "filters") {
        state.ui.activeModal = null;
      }
      if (!state.ui.activeModal) {
        document.body.classList.remove("modal-open");
      }
    } else {
      if (state.ui.activeModal !== "filters") {
        dom.filtersSheet.hidden = true;
      }
    }
  }

  function openDialog(dialog, type, focusTarget) {
    state.ui.lastFocusedElement = document.activeElement;

    if (state.ui.activeModal && state.ui.activeModal !== type) {
      closeActiveModal(false);
    }

    state.ui.activeModal = type;
    dialog.hidden = false;
    document.body.classList.add("modal-open");

    window.setTimeout(() => {
      (focusTarget || getFocusable(dialog)[0] || dialog).focus();
    }, 0);
  }

  function closeDialog(dialog, type, restoreFocus = true) {
    if (dialog.hidden) {
      return;
    }

    dialog.hidden = true;

    if (state.ui.activeModal === type) {
      state.ui.activeModal = null;
    }

    if (!state.ui.activeModal) {
      document.body.classList.remove("modal-open");
    }

    if (restoreFocus && state.ui.lastFocusedElement && typeof state.ui.lastFocusedElement.focus === "function") {
      state.ui.lastFocusedElement.focus();
    }
  }

  function closeActiveModal(restoreFocus = true) {
    if (state.ui.activeModal === "task") {
      closeTaskModal(restoreFocus);
      return;
    }

    if (state.ui.activeModal === "filters") {
      closeDialog(dom.filtersSheet, "filters", restoreFocus);
      dom.openFiltersBtn.setAttribute("aria-expanded", "false");
    }
  }

  function handleTaskSubmit(event) {
    event.preventDefault();

    const title = dom.taskTitle.value.trim();

    if (!title) {
      pushToast("Title is required.", "error");
      dom.taskTitle.focus();
      return;
    }

    if (!PRIORITIES.includes(dom.taskPriority.value)) {
      pushToast("Invalid priority selected.", "error");
      return;
    }

    if (!STATUSES.includes(dom.taskStatus.value)) {
      pushToast("Invalid column selected.", "error");
      return;
    }

    const dueDate = normalizeDueDate(dom.taskDueDate.value);

    if (dom.taskDueDate.value && !dueDate) {
      pushToast("Due date is invalid.", "error");
      dom.taskDueDate.focus();
      return;
    }

    const payload = {
      title,
      description: dom.taskDescription.value.trim(),
      priority: dom.taskPriority.value,
      dueDate,
      tags: normalizeTagList(dom.taskTags.value),
      subtasks: state.ui.draftSubtasks.map((item) => ({
        id: item.id || createId("subtask"),
        text: item.text,
        done: Boolean(item.done)
      })),
      status: dom.taskStatus.value,
      updatedAt: new Date().toISOString()
    };

    if (state.ui.editingTaskId) {
      const task = state.tasks.find((item) => item.id === state.ui.editingTaskId);

      if (!task) {
        pushToast("Task no longer exists.", "error");
        return;
      }

      const previousStatus = task.status;
      Object.assign(task, payload);

      if (previousStatus !== task.status) {
        task.order = getNextOrder(task.status);
      }

      normalizeOrders();
      pushToast("Task updated.");
    } else {
      state.tasks.push({
        id: createId("task"),
        ...payload,
        createdAt: new Date().toISOString(),
        order: getNextOrder(payload.status)
      });

      pushToast("Task created.");
    }

    saveStore();
    renderBoard();
    closeTaskModal();
  }

  function addDraftSubtask() {
    const text = dom.subtaskInput.value.trim();

    if (!text) {
      return;
    }

    state.ui.draftSubtasks.push({
      id: createId("subtask"),
      text,
      done: false
    });

    dom.subtaskInput.value = "";
    renderDraftSubtasks();
    dom.subtaskInput.focus();
  }

  function renderDraftSubtasks() {
    if (!state.ui.draftSubtasks.length) {
      dom.subtaskDraftList.innerHTML = "<li class='subtask-item'><span>No subtasks added.</span></li>";
      return;
    }

    dom.subtaskDraftList.innerHTML = state.ui.draftSubtasks
      .map((subtask) => {
        return `
          <li class="subtask-item">
            <label>
              <input type="checkbox" data-toggle-subtask="${escapeHtml(subtask.id)}" ${subtask.done ? "checked" : ""} />
              <span>${escapeHtml(subtask.text)}</span>
            </label>
            <button type="button" data-remove-subtask="${escapeHtml(subtask.id)}" aria-label="Remove subtask">Remove</button>
          </li>
        `;
      })
      .join("");
  }

  function handleGlobalKeys(event) {
    if (event.key === "Escape") {
      if (state.ui.activeModal) {
        event.preventDefault();
        closeActiveModal();
      }
      return;
    }

    if (state.ui.activeModal) {
      const activeDialog = state.ui.activeModal === "task" ? dom.taskModal : dom.filtersSheet;

      if (event.key === "Tab") {
        trapFocus(event, activeDialog);
      }

      if (state.ui.activeModal === "task" && (event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        dom.taskForm.requestSubmit();
      }

      return;
    }

    const target = event.target;

    if (isTypingContext(target)) {
      return;
    }

    if (event.key === "/") {
      event.preventDefault();
      dom.searchInput.focus();
      dom.searchInput.select();
      return;
    }

    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      openTaskModal();
      return;
    }

    if (state.ui.selectedTaskId && ((event.altKey && event.key === "ArrowLeft") || event.key === "[")) {
      event.preventDefault();
      moveTaskByStep(state.ui.selectedTaskId, -1);
      return;
    }

    if (state.ui.selectedTaskId && ((event.altKey && event.key === "ArrowRight") || event.key === "]")) {
      event.preventDefault();
      moveTaskByStep(state.ui.selectedTaskId, 1);
    }
  }

  function trapFocus(event, container) {
    const focusable = getFocusable(container);

    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function getFocusable(container) {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");

    return Array.from(container.querySelectorAll(selector)).filter((element) => {
      return !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true";
    });
  }

  function matchesAllFilters(task) {
    if (state.search) {
      const haystack = [
        task.title,
        task.description,
        task.tags.join(" "),
        task.subtasks.map((subtask) => subtask.text).join(" ")
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(state.search)) {
        return false;
      }
    }

    if (state.filters.priority !== "all" && task.priority !== state.filters.priority) {
      return false;
    }

    if (state.filters.due === "overdue" && !isTaskOverdue(task)) {
      return false;
    }

    if (state.filters.due === "week" && !isTaskDueThisWeek(task)) {
      return false;
    }

    if (state.filters.tags.length > 0) {
      const hasAll = state.filters.tags.every((tag) => task.tags.includes(tag));
      if (!hasAll) {
        return false;
      }
    }

    return true;
  }

  function hasActiveFiltersOrSearch() {
    return Boolean(
      state.search ||
        state.filters.priority !== "all" ||
        state.filters.due !== "all" ||
        state.filters.tags.length > 0
    );
  }

  function applyTheme(theme, persist) {
    state.theme = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", state.theme);

    const nextLabel = state.theme === "dark" ? "Light mode" : "Dark mode";
    dom.themeToggle.textContent = nextLabel;
    dom.themeToggle.setAttribute("aria-label", `Switch to ${nextLabel.toLowerCase()}`);

    if (persist) {
      saveStore();
    }
  }

  function syncFilterControls() {
    dom.searchInput.value = state.search;
    dom.filterPriority.value = state.filters.priority;
    dom.filterDue.value = state.filters.due;
    dom.filterTags.value = state.filters.tags.join(", ");
  }

  function getNextOrder(status) {
    const orders = state.tasks.filter((task) => task.status === status).map((task) => Number(task.order) || 0);

    if (!orders.length) {
      return 1;
    }

    return Math.max(...orders) + 1;
  }

  function isTaskOverdue(task) {
    if (!task.dueDate) {
      return false;
    }

    const due = parseDate(task.dueDate);

    if (!due) {
      return false;
    }

    const today = todayDate();
    return due.getTime() < today.getTime();
  }

  function isTaskDueThisWeek(task) {
    if (!task.dueDate) {
      return false;
    }

    const due = parseDate(task.dueDate);

    if (!due) {
      return false;
    }

    const start = todayDate();
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    return due.getTime() >= start.getTime() && due.getTime() <= end.getTime();
  }

  function todayDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function normalizeDueDate(value) {
    if (typeof value !== "string" || !value.trim()) {
      return "";
    }

    const raw = value.trim();

    if (window.dayjs) {
      const d = window.dayjs(raw);
      if (d.isValid()) {
        return d.format("YYYY-MM-DD");
      }
    }

    const date = parseDate(raw);

    if (!date) {
      return "";
    }

    return formatIsoDate(date);
  }

  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return null;
    }

    const [y, m, d] = String(value).split("-").map(Number);
    const parsed = new Date(y, m - 1, d);

    if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
      return null;
    }

    return parsed;
  }

  function formatIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDueLabel(dueDate) {
    const date = parseDate(dueDate);

    if (!date) {
      return "Invalid due date";
    }

    const today = todayDate();

    if (date.getTime() === today.getTime()) {
      return "Due today";
    }

    return `Due ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }

  function formatDate(isoDate) {
    const date = new Date(isoDate);

    if (Number.isNaN(date.getTime())) {
      return "now";
    }

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function normalizeTagList(raw) {
    const input = Array.isArray(raw) ? raw.join(",") : String(raw || "");

    const tags = input
      .split(",")
      .map((tag) => tag.trim().toLowerCase().replace(/^#+/, ""))
      .filter(Boolean);

    return Array.from(new Set(tags));
  }

  function isTypingContext(element) {
    if (!element) {
      return false;
    }

    const tag = element.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable;
  }

  function isValidDate(value) {
    if (typeof value !== "string") {
      return false;
    }

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp);
  }

  function getSystemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function pushToast(message, type = "info", timeout = 2600) {
    const toast = document.createElement("article");
    toast.className = `toast${type === "error" ? " error" : ""}`;
    toast.setAttribute("role", "status");

    toast.innerHTML = `
      <p>${escapeHtml(message)}</p>
      <button type="button" aria-label="Dismiss notification">×</button>
    `;

    const remove = () => {
      toast.remove();
    };

    toast.querySelector("button").addEventListener("click", remove);
    dom.toastRegion.append(toast);
    window.setTimeout(remove, timeout);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
