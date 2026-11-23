import { useEffect, useState } from 'react';
import Spinner from '../components/Spinner.jsx';

const MIN_MS = 1700;
const FADE_MS = 420;

// Полноэкранная картинка public/loading.png + колёсико в правом нижнем углу.
// Появляется резко (без фейда), уходить из него — плавно и быстро.
export default function LoadingScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    async function prep() {
      try {
        if (document.fonts && document.fonts.load) {
          await Promise.race([
            document.fonts.load("20px 'Russo One'"),
            wait(1200),
          ]);
        }
      } catch (e) {
        /* шрифт не критичен */
      }
      // декодируем картинку заранее, чтобы она уже лежалa в кеше
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
      <img className="loadingImg" src="/loading.png" alt="" draggable="false" />
      <Spinner />
    </div>
  );
}
