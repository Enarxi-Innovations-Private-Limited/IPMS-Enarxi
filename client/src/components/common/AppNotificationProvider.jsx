import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const NotificationContext = createContext(null);

function getNotificationStyles(type) {
    switch (type) {
        case 'error':
            return {
                card: 'border-red-500/40 bg-[#180b10]',
                iconWrap: 'bg-red-500/15 text-red-400',
                icon: 'error'
            };
        case 'success':
            return {
                card: 'border-emerald-500/40 bg-[#081611]',
                iconWrap: 'bg-emerald-500/15 text-emerald-400',
                icon: 'check_circle'
            };
        default:
            return {
                card: 'border-primary/30 bg-[#0a1220]',
                iconWrap: 'bg-primary/15 text-primary',
                icon: 'info'
            };
    }
}

export function AppNotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([]);
    const nextIdRef = useRef(1);

    const dismiss = useCallback((id) => {
        setNotifications((current) => current.filter((notification) => notification.id !== id));
    }, []);

    const notify = useCallback((message, type = 'info', duration = 4000) => {
        if (!message) return null;

        const id = nextIdRef.current++;
        setNotifications((current) => [...current, { id, message, type }]);

        if (duration > 0 && typeof window !== 'undefined') {
            window.setTimeout(() => dismiss(id), duration);
        }

        return id;
    }, [dismiss]);

    const value = useMemo(() => ({
        notify,
        success: (message, duration) => notify(message, 'success', duration),
        error: (message, duration) => notify(message, 'error', duration),
        info: (message, duration) => notify(message, 'info', duration),
        dismiss
    }), [dismiss, notify]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
            <div className="pointer-events-none fixed top-6 right-6 z-[200] flex w-full max-w-sm flex-col gap-3 px-4">
                {notifications.map((notification) => {
                    const styles = getNotificationStyles(notification.type);
                    return (
                        <div
                            key={notification.id}
                            className={`pointer-events-auto overflow-hidden rounded-2xl border shadow-2xl backdrop-blur ${styles.card}`}
                        >
                            <div className="flex items-start gap-3 p-4">
                                <div className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full ${styles.iconWrap}`}>
                                    <span className="material-symbols-outlined text-xl">{styles.icon}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold leading-6 text-white">{notification.message}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => dismiss(notification.id)}
                                    className="rounded-full p-1 text-text-secondary transition hover:bg-white/5 hover:text-white"
                                >
                                    <span className="material-symbols-outlined text-lg">close</span>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </NotificationContext.Provider>
    );
}

export function useNotifier() {
    const context = useContext(NotificationContext);

    if (!context) {
        throw new Error('useNotifier must be used within AppNotificationProvider');
    }

    return context;
}
