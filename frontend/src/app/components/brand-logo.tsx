/** Identity v2.0, board 04: the original “Ô cửa sáng” mark and live Vietnamese wordmark. */
export default function BrandLogo({ light = false }: { light?: boolean }) {
  return <span className={`brand-logo${light ? " brand-logo-light" : ""}`}>
    <img src={`/assets/brand-v2/mark${light ? "-light" : ""}.svg`} width="48" height="48" alt="" />
    <span>Góc Trọ<small>Một góc yên tâm.</small></span>
  </span>;
}
