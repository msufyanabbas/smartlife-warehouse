import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme, ThemeMode } from '../contexts/ThemeContext';

export default function ThemeToggle() {
  const { mode, setMode } = useTheme();

  const options: { value: ThemeMode; icon: React.ReactNode; label: string }[] = [
    { value: 'light', icon: <Sun size={14} />, label: 'Light' },
    { value: 'system', icon: <Monitor size={14} />, label: 'System' },
    { value: 'dark', icon: <Moon size={14} />, label: 'Dark' },
  ];

  return (
    <div className="theme-toggle" title="Toggle theme">
      {options.map(o => (
        <button
          key={o.value}
          className={`theme-toggle-btn ${mode === o.value ? 'active' : ''}`}
          onClick={() => setMode(o.value)}
          title={o.label}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}