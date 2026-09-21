/* ========================================
   Toast 提示组件
   - 排队: 同屏最多显示 maxVisible 条,超出的进入队列,空位后逐条处理
   - 关闭: 手动关闭与自动关闭走同一条幂等路径,定时器统一清理
   - 清理: clearAll 同时清空队列与定时器,旧提示不会再冒出来
   ======================================== */

class Toast {
    constructor() {
        this.container = null;
        this.toasts = [];        // 当前可见的提示记录
        this.queue = [];         // 等待显示的提示队列
        this.maxVisible = 3;     // 同屏最多显示的条数,避免堆到屏幕外
        this.exitDuration = 300; // 退场动画时长,与 CSS 保持一致
        this.nextId = 1;
        this.init();
    }

    init() {
        // 创建 toast 容器
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    /**
     * 显示 toast 提示
     * @param {Object} options - 配置选项
     * @param {string} options.type - 类型: success, error, warning, info
     * @param {string} options.title - 标题
     * @param {string} options.message - 消息内容
     * @param {number} options.duration - 显示时长(ms);success/warning/info 默认 4000,
     *                                    error 默认 0(不自动关闭,需手动关闭)
     * @param {boolean} options.closable - 是否可关闭,默认 true
     * @returns {HTMLElement} toast 元素(可作为 close 的参数)
     */
    show(options) {
        const opts = Object.assign({
            type: 'info',
            title: '',
            message: '',
            duration: undefined,
            closable: true
        }, options);

        // 异常提示默认不自动消失,保证能被看到并手动关闭
        if (opts.duration === undefined || opts.duration === null) {
            opts.duration = opts.type === 'error' ? 0 : 4000;
        }

        const record = {
            id: this.nextId++,
            options: opts,
            el: this._createElement(opts),
            timer: null,
            closing: false
        };

        // 排队:有空位直接显示,否则进入队列等待逐条处理
        if (this.toasts.length < this.maxVisible) {
            this._mount(record);
        } else {
            this.queue.push(record);
        }

        return record.el;
    }

    // 创建 toast 元素(此时不挂载,进度条动画与自动关闭计时在挂载时才开始)
    _createElement(options) {
        const { type, title, message, duration, closable } = options;

        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.setAttribute('role', type === 'error' ? 'alert' : 'status');

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        const icon = document.createElement('div');
        icon.className = 'toast-icon';
        icon.textContent = icons[type] || icons.info;
        el.appendChild(icon);

        const content = document.createElement('div');
        content.className = 'toast-content';
        if (title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'toast-title';
            titleEl.textContent = title;
            content.appendChild(titleEl);
        }
        if (message) {
            const messageEl = document.createElement('div');
            messageEl.className = 'toast-message';
            messageEl.textContent = message;
            content.appendChild(messageEl);
        }
        el.appendChild(content);

        if (closable) {
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'toast-close';
            closeBtn.setAttribute('aria-label', '关闭');
            closeBtn.textContent = '✕';
            closeBtn.addEventListener('click', () => this.close(el));
            el.appendChild(closeBtn);
        }

        // 只有会自动关闭的提示才渲染进度条,避免残留
        if (duration > 0) {
            const progress = document.createElement('div');
            progress.className = 'toast-progress';
            progress.style.animationDuration = `${duration}ms`;
            el.appendChild(progress);
        }

        return el;
    }

    // 挂载到容器并开始自动关闭计时
    _mount(record) {
        this.container.appendChild(record.el);
        this.toasts.push(record);

        const { duration } = record.options;
        if (duration > 0) {
            record.timer = setTimeout(() => this.close(record), duration);
        }
    }

    /**
     * 关闭 toast(手动关闭与自动关闭共用此路径,重复调用安全)
     * @param {HTMLElement|Object|number} target - toast 元素、记录或 id
     */
    close(target) {
        const record = this._findRecord(target);
        if (!record || record.closing) return;

        record.closing = true;

        // 清掉自动关闭定时器,避免与手动关闭同时发生导致残留
        if (record.timer) {
            clearTimeout(record.timer);
            record.timer = null;
        }

        if (record.el.parentNode) {
            // 已显示:播放退场动画后再移除
            record.el.classList.add('toast-exit');
            setTimeout(() => this._remove(record), this.exitDuration);
        } else {
            // 仍在队列中未显示:直接移除
            this._remove(record);
        }
    }

    // 查找对应的提示记录(兼容元素、记录、id 三种入参)
    _findRecord(target) {
        if (!target) return null;
        const all = this.toasts.concat(this.queue);
        if (all.indexOf(target) > -1) return target;
        for (let i = 0; i < all.length; i++) {
            if (all[i].el === target || all[i].id === target) return all[i];
        }
        return null;
    }

    // 移除记录并释放位置,触发队列逐条处理(可重复调用)
    _remove(record) {
        if (record.el.parentNode) {
            record.el.parentNode.removeChild(record.el);
        }

        let index = this.toasts.indexOf(record);
        if (index > -1) this.toasts.splice(index, 1);

        index = this.queue.indexOf(record);
        if (index > -1) this.queue.splice(index, 1);

        this._drain();
    }

    // 逐条处理:有空位时从队列取出下一条显示
    _drain() {
        while (this.toasts.length < this.maxVisible && this.queue.length > 0) {
            this._mount(this.queue.shift());
        }
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

    // 清除所有 toast:清空队列与定时器,旧提示不会再冒出来
    clearAll() {
        this.queue.length = 0;
        [...this.toasts].forEach(record => this.close(record));
    }
}

// 创建全局实例
window.toast = new Toast();
