import { useState } from 'react';
import { useStore } from '../store/useStore';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [error, setError] = useState('');
  const { login, register, connectSocket } = useStore();

  const handleAvatar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegister) {
        await register(username, password, displayName);
        // Загружаем аватарку если выбрана
        if (avatarPreview) {
          const { uploadAvatar } = useStore.getState();
          await uploadAvatar(avatarPreview);
        }
      } else {
        await login(username, password);
      }
      connectSocket();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">💬 Messenger</h1>
        <p className="auth-subtitle">Общайся с кентами бесплатно</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Avatar upload */}
          {isRegister && (
            <div className="avatar-upload">
              <label htmlFor="avatar-input" className="avatar-label">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="avatar" className="avatar-preview" />
                ) : (
                  <div className="avatar-placeholder">📷</div>
                )}
              </label>
              <input id="avatar-input" type="file" accept="image/*" onChange={handleAvatar} hidden />
              <span className="avatar-hint">Фото</span>
            </div>
          )}

          {isRegister && (
            <input
              type="text"
              placeholder="Отображаемое имя"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              className="auth-input"
            />
          )}
          <input
            type="text"
            placeholder="Юзернейм (мин 3 символа)"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            className="auth-input"
          />
          <input
            type="password"
            placeholder="Пароль (мин 4 символа)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="auth-input"
          />
          <button type="submit" className="auth-btn">
            {isRegister ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </form>

        <button
          className="auth-toggle"
          onClick={() => setIsRegister(!isRegister)}
        >
          {isRegister ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Регистрация'}
        </button>
      </div>
    </div>
  );
}
