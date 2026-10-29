const ASSET_ROOT = "/mascot/cloudy-2d";

export function CloudyPortrait() {
  return <span className="cloudy-chat__avatar" aria-hidden="true">
    <img className="cloudy-2d__layer" src={`${ASSET_ROOT}/cloud-body.png`} alt="" />
    <span className="cloudy-2d__eye-pair">
      <img className="cloudy-2d__layer cloudy-2d__eye cloudy-2d__eye--left" src={`${ASSET_ROOT}/cloud-eyes-open.png`} alt="" />
      <img className="cloudy-2d__layer cloudy-2d__eye cloudy-2d__eye--right" src={`${ASSET_ROOT}/cloud-eyes-open.png`} alt="" />
    </span>
    <img className="cloudy-2d__layer cloudy-2d__nose" src={`${ASSET_ROOT}/cloud-nose.png`} alt="" />
    <img className="cloudy-2d__layer cloudy-2d__mouth-idle" src={`${ASSET_ROOT}/cloud-mouth-idle.png`} alt="" />
  </span>;
}
