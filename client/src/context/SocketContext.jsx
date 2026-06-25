import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
    const socketRef = useRef(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const socket = io(window.location.origin, {
            path: '/socket.io',
            withCredentials: true,
            transports: ['websocket', 'polling'],
        });

        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));

        socketRef.current = socket;
        return () => socket.disconnect();
    }, []);

    return (
        <SocketContext.Provider value={{ socket: socketRef, connected }}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket() {
    return useContext(SocketContext);
}
