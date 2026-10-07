(() => {
  const css = document.createElement('style');
  css.textContent = `
    .view{font-family:"Be Vietnam Pro",system-ui,sans-serif!important;font-size:14px!important;line-height:1.5!important}
    .view h1{font-size:24px!important;line-height:1.3!important;font-weight:700!important}
    .view h2{font-size:18px!important;line-height:1.35!important;font-weight:700!important}
    .view h3{font-size:16px!important;line-height:1.4!important;font-weight:600!important}
    .view p,.view label,.view td,.view li{font-size:14px!important;line-height:1.5!important}
    .view .sub,.view .hint,.view .d{font-size:13px!important;line-height:1.5!important}
    .view small,.view th,.view .err,.view .chip,.view .role,.view .tag{font-size:12px!important}
    .view button,.view input,.view select,.view textarea{font-family:"Be Vietnam Pro",system-ui,sans-serif!important;font-size:14px!important}
    .view .btn.sm,.view .setting-btn{font-size:13px!important}
    #v-home .hero h1{font-size:clamp(36px,5vw,48px)!important;line-height:1.15!important}
    #v-home .hero p{font-size:16px!important}
    #v-home .listing-price{font-size:21px!important}
    #v-home .listing-price small{font-size:12px!important}
    #v-tk .settings-head p,#v-tk .setting-card .hint,#v-qt #crumb,#v-qt .head>div>p.d,#v-ad .stabs,#v-hd .reset-btn,#v-tk .setting-card:has(#planName){display:none!important}
    #v-tk .settings-head{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
    #v-tk .settings-head .role{display:inline-flex!important;align-items:center;justify-content:center;align-self:flex-start;flex:none;width:auto;max-width:none;white-space:nowrap;overflow:visible;border-radius:99px;background:#0F684A;color:#fff;font:600 12px/1.2 "Be Vietnam Pro",system-ui,sans-serif!important;padding:7px 13px;margin:0}
    #v-tk .setting-tabs button{font-size:14px!important}
    #v-tk .setting-field label{font-size:13px!important}
    #v-tk .setting-table th{font-size:12px!important}
    #v-tk .account-dropdown,#v-ad .account-dropdown{position:relative;display:flex;align-items:center}
    #v-tk .account-menu,#v-ad .account-menu{position:absolute;top:100%;right:0;display:none;min-width:220px;padding:6px;background:#fff;border:1px solid #ecdcc6;border-radius:12px;box-shadow:0 12px 30px #1f293720;z-index:40}
    #v-tk .account-dropdown:hover .account-menu,#v-tk .account-dropdown:focus-within .account-menu,#v-ad .account-dropdown:hover .account-menu,#v-ad .account-dropdown:focus-within .account-menu{display:grid}
    #v-tk .account-menu a,#v-ad .account-menu a{display:block;border:0!important;border-radius:8px!important;padding:10px 12px!important;white-space:nowrap;font:500 14px/1.4 "Be Vietnam Pro",system-ui,sans-serif!important}
    #v-tk .account-menu a:hover,#v-ad .account-menu a:hover{background:#FFF5E9;color:#0F684A}
    #v-tk .role{display:inline-flex;align-items:center;white-space:nowrap;font-family:"Be Vietnam Pro",system-ui,sans-serif!important}
  `;
  document.head.append(css);
})();
