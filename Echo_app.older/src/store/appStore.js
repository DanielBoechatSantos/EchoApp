import React, { createContext, useContext, useState } from 'react';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [auth, setAuth] = useState({ logged: false, user: null });
  const [role, setRole] = useState(null); // 'musico' | 'nao_musico'
  const [isRouter, setIsRouter] = useState(false);
  const [currentSong, setCurrentSong] = useState(null); // { id, title, letraUrl, cifraUrl }

  const value = {
    auth, setAuth,
    role, setRole,
    isRouter, setIsRouter,
    currentSong, setCurrentSong,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => useContext(AppContext);
