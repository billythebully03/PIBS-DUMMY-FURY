import { useEffect, useState } from 'react';
import Spinner from '../components/Spinner.jsx';

const MIN_MS = 6000; // загрузка с картинкой держится минимум 6 секунд
const FADE_MS = 420;

// Картинка встаёт по высоте целиком; боковые полосы закрывает размытая копия.
export default function LoadingScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    async function prep() {
      try {
        if (document.fonts && document.fonts.load) {
          await Promise.race([document.fonts.load("20px 'Dela Gothic One'"), wait(1500)]);
        }
      } catch (e) {
        /* шрифт не критичен */
      }
      const img = new Image();
      img.src = '/loading.png';
      try {
        await img.decode();
      } catch (e) {
        /* перейдём дальше по таймеру */
      }
    }

    prep()
      .then(() => {
        const rest = Math.max(0, MIN_MS - (performance.now() - started));
        return wait(rest);
      })
      .then(() => {
        if (cancelled) return;
        setLeaving(true);
        return wait(FADE_MS);
      })
      .then(() => {
        if (!cancelled) onDone();
      });

    return () => {
      cancelled = true;
    };
  }, [onDone]);

  return (
    <div className={`screen loading active ${leaving ? 'leaving' : ''}`}>
      <img className="loadingBlur" src="/loading.png" alt="" draggable="false" />
      <div className="loadingFg">
        <img className="loadingImg" src="/loading.png" alt="" draggable="false" />
      </div>
      <Spinner />
    </div>
  );
}
