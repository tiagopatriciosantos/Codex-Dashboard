import { BarChart3, Code2, LayoutDashboard, List, ShieldCheck } from 'lucide-react';
export type DashboardSection = 'overview' | 'threads' | 'analytics' | 'accuracy';
type Props = { active: DashboardSection; onNavigate: (section: DashboardSection) => void };
const sections = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'threads', label: 'Threads', Icon: List },
  { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
  { id: 'accuracy', label: 'Methodology', Icon: ShieldCheck }
] as const;
function Items({ active, onNavigate }: Props) {
  return <>{sections.map(({ id, label, Icon }) => (
    <button key={id} type="button" className={`nav-item ${active === id ? 'active' : ''}`}
      aria-current={active === id ? 'location' : undefined} onClick={() => onNavigate(id)}>
      <Icon size={18} /><span>{label}</span>
    </button>
  ))}</>;
}
export function Sidebar({ active, onNavigate, connected, planType }: Props & { connected: boolean; planType: string | null }) {
  return <aside className="sidebar">
    <div className="sidebar-brand"><Code2 size={23} /><strong>Codex Usage</strong></div>
    <nav className="sidebar-nav" aria-label="Dashboard sections"><Items active={active} onNavigate={onNavigate} /></nav>
    <div className="sidebar-account"><span className={`connection-dot ${connected ? 'online' : 'offline'}`} />
      <div><strong>{planType ?? 'Local account'}</strong><span>{connected ? 'Connected' : 'Offline'}</span></div>
    </div>
  </aside>;
}
export function MobileNavigation(props: Props) {
  return <nav className="mobile-navigation" aria-label="Mobile dashboard sections"><Items {...props} /></nav>;
}
