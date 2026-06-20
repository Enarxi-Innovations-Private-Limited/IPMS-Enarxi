import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

export default function NotificationBell() {
    const [notifications, setNotifications] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/notifications');
            if (Array.isArray(res.data)) {
                setNotifications(res.data);
                setUnreadCount(res.data.filter(n => !n.isRead).length);
            } else {
                setNotifications([]);
                setUnreadCount(0);
            }
        } catch (err) {
            console.error('Failed to fetch notifications', err);
        }
    };

    useEffect(() => {
        fetchNotifications();
        // Poll every 2 minutes to reduce server load and log noise
        const interval = setInterval(fetchNotifications, 120000);
        return () => clearInterval(interval);
    }, []);

    const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
            setShowDropdown(false);
        }
    };

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleBellClick = () => {
        setShowDropdown(!showDropdown);
        if (!showDropdown) {
            fetchNotifications();
        }
    };

    const handleMarkAsRead = async (id) => {
        try {
            await api.put(`/notifications/${id}/read`);
            setNotifications(notifications.map(n =>
                n._id === id ? { ...n, isRead: true } : n
            ));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error(err);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await api.put('/notifications/read-all');
            setNotifications(notifications.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error(err);
        }
    };

    const handleNotificationClick = async (notification) => {
        if (!notification.isRead) {
            await handleMarkAsRead(notification._id);
        }

        // Navigation logic based on type
        if (notification.type === 'PROJECT_ASSIGNMENT' || notification.type === 'STATUS_UPDATE') {
            // Navigate to project details or tasks logic
            // Assuming relatedId is project ID or can be derived.
            // If relatedId is Task, we might need to know Project ID to navigate to project view.
            // For now, let's try to navigate to related entity if possible.
            // Since we often just store ID, we rely on context. 
            // For Project Assignment, relatedId is Project.
            if (notification.relatedId) {
                // Determine user role to know which path to go? 
                // Or generic path. The bell is used by all.
                // Manager: /manager/projects
                // Employee: /employee/projects or /employee/tasks
                // Simplest is to just go to projects list if complex, or specific page if possible.
                // Optimally we'd navigate to specific project.
                // Let's defer navigation specific logic or just close dropdown.
            }
        }
        setShowDropdown(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={handleBellClick}
                className="relative p-2 text-text-secondary hover:text-white transition-colors"
                title="Notifications"
            >
                <span className="material-symbols-outlined text-2xl">notifications</span>
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-background-dark">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {showDropdown && (
                <>
                    <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] md:hidden" onClick={() => setShowDropdown(false)}></div>
                    <div className="fixed left-4 right-4 top-16 md:absolute md:top-full md:right-0 md:left-auto md:w-80 bg-[#161A23] border border-[#31384b] rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[#31384b] bg-[#202636]">
                            <h3 className="text-sm font-semibold text-[#f4f7ff]">Notifications</h3>
                            {unreadCount > 0 && (
                                <button
                                    onClick={handleMarkAllRead}
                                    className="text-xs font-medium text-[#8bc6ff] hover:text-[#c4e2ff] transition-colors"
                                >
                                    Mark all as read
                                </button>
                            )}
                        </div>
                        <div className="max-h-96 overflow-y-auto bg-[#161A23]">
                            {notifications.length > 0 ? (
                                notifications.map((notification) => (
                                    <div
                                        key={notification._id}
                                        onClick={() => handleNotificationClick(notification)}
                                        className={`px-4 py-3 border-b border-[#31384b] last:border-0 cursor-pointer transition-colors ${
                                            !notification.isRead
                                                ? 'bg-[#1d2740] hover:bg-[#23304f]'
                                                : 'bg-[#161A23] hover:bg-[#1c2230]'
                                        }`}
                                    >
                                        <div className="flex gap-3">
                                            <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${!notification.isRead ? 'bg-[#36c2ff]' : 'bg-[#4a5268]'}`} />
                                            <div className="flex-1">
                                                <p className={`text-sm leading-6 ${!notification.isRead ? 'text-[#f4f7ff] font-medium' : 'text-[#c6d0e1]'}`}>
                                                    {notification.message}
                                                </p>
                                                <p className="mt-1 text-xs text-[#8d98ad]">
                                                    {new Date(notification.createdAt).toLocaleDateString()} {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="px-4 py-8 text-center text-sm text-[#a7b1c4]">
                                    <span className="material-symbols-outlined text-4xl mb-2 opacity-50 block mx-auto">notifications_off</span>
                                    No notifications
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
