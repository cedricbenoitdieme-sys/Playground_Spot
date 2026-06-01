import React, { createContext, useContext, useState } from 'react';

export const MOCK_USERS = {
  admin: {
    id: '1',
    nom: 'Admin Dakar',
    email: 'admin@playgroundspot.com',
    role: 'admin',
    avatar: 'AD'
  },
  gerant: {
    id: '2',
    nom: 'Ibrahima Fall',
    email: 'ibrahima@playgroundspot.com',
    role: 'gerant',
    terrain: 'Terrain Les Champions — Almadies',
    avatar: 'IF'
  },
  joueur: {
    id: '3',
    nom: 'Moussa Diallo',
    email: 'moussa@playgroundspot.com',
    role: 'joueur',
    quartier: 'Médina',
    avatar: 'MD'
  }
};

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const urlParams = new URLSearchParams(window.location.search);
  const roleParam = urlParams.get('role');
  
  const getInitialUser = () => {
    if (roleParam && MOCK_USERS[roleParam]) {
      localStorage.setItem('currentUser', JSON.stringify(MOCK_USERS[roleParam]));
      return MOCK_USERS[roleParam];
    }
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch (e) {
        localStorage.removeItem('currentUser');
      }
    }
    return null; // default unauthenticated
  };

  const [currentUser, setCurrentUser] = useState(getInitialUser);
  
  const handleSetCurrentUser = (user) => {
    if (user) {
      localStorage.setItem('currentUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('currentUser');
    }
    setCurrentUser(user);
  };

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser: handleSetCurrentUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
