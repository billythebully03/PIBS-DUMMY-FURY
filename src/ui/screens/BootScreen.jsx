import { useEffect } from 'react';

// Чёрный экран «MADE BY PIBS». Логотип держится ~3.6 секунды,
// картинка загрузки тем временем прогружается в фоне.
export default function BootScreen({ onDone }) {
  useEffect(() => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onDone();
    };

    const img = new Image();
    img.src = '/loading.png';
    img.onload = () => {
      /* кеш прогрет — следующий экран покажет картинку мгновенно */
    };
    img.onerror = () => {
      /* файла может ещё не быть — не блокируем загрузку */
    };

    const t = setTimeout(finish, 3600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="screen boot active">
      <div className="logo">
        <div className="made">MADE BY</div>
        <div className="pibs">PIBS</div>
      </div>
      <div className="caption">Игра создана двумя людьми при ничьей поддержке</div>
    </div>
  );
}
