export class NotificationFeed {

    constructor(parent = document.body) {
        this.items = [];
        this.maxItems = 4;
        this.lifetime = 4000;
        this.parent = parent;
        this.createUI();
    }

    createUI() {
        if (!document.getElementById('notificationFeedStyles')) {
            const style = document.createElement('style');
            style.id = 'notificationFeedStyles';
            style.textContent = `
                @keyframes notifSlideIn {
                    from { transform: translateX(-12px); opacity: 0; }
                    to   { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        this.el = document.createElement('div');
        this.el.id = 'notificationFeed';

        this.el.style.cssText = `
            width: 100%;
            pointer-events: none;
            display: flex;
            flex-direction: column;
            gap: 6px;
        `;
        this.parent.appendChild(this.el);
    }

    push(title, subtitle = '', accent = '#ef4e23') {
        const item = { title, subtitle, accent, timestamp: Date.now() };
        this.items.unshift(item);
        if (this.items.length > this.maxItems) this.items.pop();
        this.render();
        setTimeout(() => this.expire(), this.lifetime);
    }

    expire() {
        const now = Date.now();
        this.items = this.items.filter((i) => now - i.timestamp < this.lifetime);
        this.render();
    }

    render() {
        if (!this.el) return;
        this.el.innerHTML = '';
        this.items.forEach((item) => {
            const age = Date.now() - item.timestamp;
            const opacity = Math.max(0.35, 1 - (age / this.lifetime) * 0.5);
            const row = document.createElement('div');
            row.style.cssText = `
                background: rgba(26, 36, 71, 0.9);
                border: 1px solid rgba(239, 78, 35, 0.18);
                border-left: 4px solid ${item.accent};
                border-radius: 0 8px 8px 0;
                padding: 9px 14px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                backdrop-filter: blur(8px);
                animation: notifSlideIn 0.2s ease-out;
                opacity: ${opacity};
                transition: opacity 0.3s ease-out;
            `;
            row.innerHTML = `
                <div style="font-size: 14px; font-weight: 700; color: #ef4e23; text-transform: uppercase; letter-spacing: 0.5px;">${item.title}</div>
                ${item.subtitle ? `<div style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(239, 78, 35, 0.55); margin-top: 3px;">${item.subtitle}</div>` : ''}
            `;
            this.el.appendChild(row);
        });
    }

    clear() {
        this.items = [];
        this.render();
    }
}
