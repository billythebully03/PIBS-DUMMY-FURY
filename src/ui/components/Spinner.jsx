// Маленькое колёсико загрузки в правом нижнем углу.
// Цвет базовый #6652FB, плавно уходит в холодный/розовый и обратно.
export default function Spinner() {
  return (
    <div className="spinner" aria-hidden="true">
      <div className="spinnerRing" />
    </div>
  );
}
