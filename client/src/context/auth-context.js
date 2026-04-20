import { createContext } from 'react';

/**
 * Một module chỉ chứa `createContext` — tham chiếu ổn định khi HMR cập nhật AuthContext.jsx.
 */
export const AuthContext = createContext(null);
