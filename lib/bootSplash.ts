// Runs before the first paint (layout.tsx): show the opening splash only on the
// first open of the web app in this tab — never on the landing page or right
// after logging in (that has its own welcome splash).
export const BOOT_SPLASH_SCRIPT = `try{var bs=sessionStorage.getItem("migwith.bootSplash");if(bs||location.pathname==="/welcome"||/^(www\\.)?miglife\\.app$/i.test(location.hostname)||sessionStorage.getItem("migwith.welcomeSplash")){document.documentElement.classList.add("no-boot-splash")}else{sessionStorage.setItem("migwith.bootSplash","1")}}catch(e){document.documentElement.classList.add("no-boot-splash")}`;
