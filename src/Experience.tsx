import {useEffect,useState} from 'react';
import {ArrowRight} from 'lucide-react';
export function MobileSplash() {
  const [visible, setVisible] = useState(() => {
    try {
      return (
        !sessionStorage.getItem("smilepec-welcome-v2") &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!visible) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const end = () => {
      try {
        sessionStorage.setItem("smilepec-welcome-v2", "1");
      } catch {}
      setVisible(false);
    };
    const timer = setTimeout(end, 900);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = old;
    };
  }, [visible]);
  if (!visible) return null;
  return (
    <div
      className="mobile-splash"
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenue sur SmilePec"
    >
      <div className="splash-halo one" />
      <div className="splash-halo two" />
      <span className="splash-star star-one">✧</span>
      <span className="splash-star star-two">✧</span>
      <div className="splash-content">
        <div className="splash-logo">
          <img src="/brand/smilepec-original-stacked.svg" alt="SmilePec" />
        </div>
        <p>Le soin, ensemble.</p>
        <div className="splash-line" />
        <small>Un même espace. Tous vos sourires.</small>
      </div>
      <button
        onClick={() => {
          try {
            sessionStorage.setItem("smilepec-welcome-v2", "1");
          } catch {}
          setVisible(false);
        }}
      >
        Entrer dans SmilePec
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
