/* ========================================
   Toast 提示组件
   - 排队：同屏最多 maxVisible 条，其余进入队列，每关闭一条再补一条
   - 关闭：每条提示独立持有自动关闭/离场定时器，手动、自动、清空统一收口，只生效一次
   - 清理：清空会同时取消等待队列与全部定时器，关闭后的提示不会再次出现
   ======================================== */

class Toast {
    constructor() {
        this.container = null;
        this.queue = [];           // 等待上屏的提示记录
        this.active = new Map();   // 已上屏的提示记录: id -> entry
        this.maxVisible = 3;       // 同屏最大条数，超出的逐条排队
        this.exitDuration = 300;   // 与 CSS 中 toastSlideOut 时长保持一致
        this.seq = 0;
        this.init();
    }

    init() {
        // 创建 toast 容器
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        this.container.setAttribute('aria-live', 'polite');
        document.body.appendChild(this.container);

        // 事件委托：动态进出的提示共用一个监听器，保证每条提示的关闭按钮始终可点
        this.container.addEventListener('click', (event) => this.handleContainerClick(event));
    }

    handleContainerClick(event) {
        const closeBtn = event.target.closest('.toast-close');
        if (!closeBtn || closeBtn.disabled) return;
        const toastEl = closeBtn.closest('.toast');
        if (!toastEl) return;
        const entry = this.active.get(Number(toastEl.dataset.toastId));
        if (entry) this.dismiss(entry);
    }

    /**
     * 显示 toast 提示
     * @param {Object} options - 配置选项
     * @param {string} options.type - 类型: success, error, warning, info
     * @param {string} options.title - 标题
     * @param {string} options.message - 消息内容
     * @param {number} options.duration - 显示时长(ms)，默认 4000；传 0 表示常驻。
     *                                    error 类型默认常驻，需手动关闭
     * @param {boolean} options.closable - 是否可关闭，默认 true
     */
    show(options = {}) {
        const validTypes = ['success', 'error', 'warning', 'info'];
        const type = validTypes.includes(options.type) ? options.type : 'info';

        // 异常提示默认常驻(duration = 0)，保证能被看到并由用户手动关闭；
        // 成功等其他类型保持 4000ms 的原有消失节奏
        let duration;
        if (options.duration !== undefined) {
            duration = options.duration;
        } else {
            duration = type === 'error' ? 0 : 4000;
        }
        if (!Number.isFinite(duration) || duration < 0) duration = 4000;

        const entry = {
            id: ++this.seq,
            type,
            title: options.title || '',
            message: options.message || '',
            duration,
            closable: options.closable !== false,
            el: null,
            autoTimer: null,    // 自动关闭定时器
            removeTimer: null,  // 离场动画后的移除定时器
            status: 'queued'    // queued -> active -> closing -> closed（clearAll 时可能为 cancelled）
        };

        this.queue.push(entry);
        this.pump();

        return entry.el;
    }

    // 按同屏上限，把队列中的提示逐条送上屏幕
    pump() {
        while (this.active.size < this.maxVisible && this.queue.length > 0) {
            const entry = this.queue.shift();
            if (entry.status !== 'queued') continue; // 已被 clearAll 取消，不再挂载
            this.mount(entry);
        }
    }

    // 挂载单条提示并启动它自己的自动关闭计时
    mount(entry) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${entry.type}`;
        toast.dataset.toastId = String(entry.id);
        if (entry.type === 'error') {
            toast.setAttribute('role', 'alert');
        }

        toast.innerHTML = `
            <div class="toast-icon">${icons[entry.type] || icons.info}</div>
            <div class="toast-content">
                ${entry.title ? `<div class="toast-title">${entry.title}</div>` : ''}
                ${entry.message ? `<div class="toast-message">${entry.message}</div>` : ''}
            </div>
            ${entry.closable ? '<button type="button" class="toast-close" aria-label="关闭提示">✕</button>' : ''}
            ${entry.duration > 0 ? `<div class="toast-progress" style="animation-duration: ${entry.duration}ms"></div>` : ''}
        `;

        entry.el = toast;
        entry.status = 'active';
        this.container.appendChild(toast);
        this.active.set(entry.id, entry);

        // 仅自动消失的提示启动计时；常驻提示（如 error）等待手动关闭
        if (entry.duration > 0) {
            entry.autoTimer = setTimeout(() => this.dismiss(entry), entry.duration);
        }
    }

    /**
     * 关闭单条提示的唯一收口：手动关闭、自动关闭、clearAll 都走这里，
     * 通过 status 保证整条生命周期只执行一次
     */
    dismiss(entry) {
        if (!entry || entry.status === 'closing' || entry.status === 'closed' || entry.status === 'cancelled') {
            return;
        }
        entry.status = 'closing';

        // 自动关闭与手动关闭同时发生时，清掉尚未触发的自动关闭，避免重复处理
        if (entry.autoTimer !== null) {
            clearTimeout(entry.autoTimer);
            entry.autoTimer = null;
        }

        const toast = entry.el;
        if (!toast) {
            this.remove(entry);
            return;
        }

        toast.classList.add('toast-exit');
        // 关闭按钮在离场过程中不再重复触发
        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) closeBtn.disabled = true;

        entry.removeTimer = setTimeout(() => this.remove(entry), this.exitDuration);
    }

    // 单条提示彻底离场：移除 DOM、注销记录，再从队列补下一条
    remove(entry) {
        if (entry.status === 'closed') return;

        if (entry.removeTimer !== null) {
            clearTimeout(entry.removeTimer);
            entry.removeTimer = null;
        }

        const toast = entry.el;
        if (toast && toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
        entry.el = null;
        entry.status = 'closed';
        this.active.delete(entry.id);

        // 一条处理完再处理下一条，保证提示区域始终与当前状态一致
        this.pump();
    }

    // 兼容原有 API：支持传入 toast DOM 元素关闭
    close(target) {
        if (!target) return;
        let entry = null;
        if (target instanceof Element) {
            const id = Number(target.dataset.toastId);
            entry = this.active.get(id) || this.queue.find(item => item.el === target);
        } else {
            entry = target;
        }
        if (entry) this.dismiss(entry);
    }

    // 快捷方法
    success(title, message, duration) {
        return this.show({ type: 'success', title, message, duration });
    }

    error(title, message, duration) {
        return this.show({ type: 'error', title, message, duration });
    }

    warning(title, message, duration) {
        return this.show({ type: 'warning', title, message, duration });
    }

    info(title, message, duration) {
        return this.show({ type: 'info', title, message, duration });
    }

    // 清除所有 toast（含等待队列），清空后不会再有旧提示冒出来
    clearAll() {
        // 1. 取消尚未上屏的排队项，使其 pump 时被跳过、永不挂载
        this.queue.forEach(entry => {
            entry.status = 'cancelled';
        });
        this.queue = [];

        // 2. 已上屏的提示逐条走统一关闭流程（定时器清理 + 离场动画 + DOM 移除）
        Array.from(this.active.values()).forEach(entry => this.dismiss(entry));
    }
}

// 创建全局实例
window.toast = new Toast();
