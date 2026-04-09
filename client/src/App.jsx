import { useEffect } from 'react';
import { useStore } from './store/useStore';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import './App.css';

function App() {
  const { isLoggedIn, connectSocket } = useStore();

  useEffect(() => {
    if (isLoggedIn) {
      connectSocket();
    }
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return <Login />;
  }

  return (
    <div className="app">
      <Sidebar />
      <ChatWindow />
    </div>
  );
}

export default App;
