
/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */
const API_URL = "https://project-invie.vercel.app/api/store";
const DELIVERY_FORM_LINK = "https://docs.google.com/forms/d/e/1FAIpQLSc3_zXePFiNo5AJlryelaXK7iVG34_LBh90TJIVqms-nUmMLQ/viewform?usp=dialog";
const DELIVERY_COLUMNS = {
  main1: ["Home Delivery", "Nearby Delivery", "Pick-up"],
  main2: ["Home Delivery-2", "Nearby Delivery-2", "Pick-up"]
};
const DELIVERY_DESCRIPTIONS = {
  "Home Delivery": "Delivered directly to your address",
  "Nearby Delivery": "Pickup from nearby location",
  "Home Delivery-2": "Delivered directly to your address",
  "Nearby Delivery-2": "Pickup from nearby location",
  "Pick-up": "Pickup from our shop at nitel junction"
};
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

function getCache(key) {
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  try {
    const {timestamp, data} = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_EXPIRY_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch (e) {
    localStorage.removeItem(key);
    return null;
  }
}

function setCache(key, data) { localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data })); }
function saveCartToCache() { localStorage.setItem("odogwu_cart", JSON.stringify(cart)); }
function showLoading() { document.getElementById("loadingOverlay").style.display = "flex"; }
function hideLoading() { document.getElementById("loadingOverlay").style.display = "none"; }
function normalizePhone(phone){
  phone = phone.toString().trim().replace(/\s+/g,"").replace(/\-/g,"");
  if(phone.startsWith("+234")) phone = "0" + phone.slice(4);
  else if(phone.startsWith("234")) phone = "0" + phone.slice(3);
  return phone;
}

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let rawProducts = [], bannerRows = [], productCards = [], cart = [];
let whatsappNumber = "", selectedCat = "All", categories = [], expandedCards = new Set();
let selectedDeliveryOption = null, selectedMainOption = null, selectedSubOption = null, selectedDeliveryFee = 0;
let latestDeliveryRow = null, settingsData = null;
let activeBannerAdValue = null, bannerCurrentIndex = 0, bannerTimer = null;
const BANNER_INTERVAL_MS = 3500;

/* ═══════════════════════════════════════
   INIT & NAVIGATION TABS
═══════════════════════════════════════ */
async function init() {
  restoreCartFromCache();
  loadUserInfo(); // Load cached details for the user profile section
  showLoading();
  await Promise.all([loadSettings(), loadProducts()]);
  hideLoading();
}

function switchTab(tabName) {
  document.getElementById("storeView").style.display = tabName === "store" ? "block" : "none";
  document.getElementById("detailsView").style.display = tabName === "details" ? "block" : "none";
  
  // Cleanly toggle Header items depending on the view
  const searchBar = document.getElementById("headerActions");
  const chipsSection = document.getElementById("categoryChipsSection");
  if(searchBar) searchBar.style.display = tabName === "store" ? "flex" : "none";
  if(chipsSection) chipsSection.style.display = tabName === "store" ? "flex" : "none";

  // Update Nav Buttons
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  if (tabName === "store") document.getElementById("navStore").classList.add("active");
  if (tabName === "details") {
    document.getElementById("navDetails").classList.add("active");
    loadUserInfo();
  }
}

/* ═══════════════════════════════════════
   USER DETAILS CACHING
═══════════════════════════════════════ */
function cacheUserInfo(name, phone, address) {
  const userInfo = { name, phone, address };
  localStorage.setItem("odogwu_user_info", JSON.stringify(userInfo));
  loadUserInfo();
}

function loadUserInfo() {
  const cached = localStorage.getItem("odogwu_user_info");
  if(cached) {
    try {
      const info = JSON.parse(cached);
      const n = document.getElementById("detailName");
      const p = document.getElementById("detailPhone");
      const a = document.getElementById("detailAddress");
      if(n) n.textContent = info.name || "Not provided yet";
      if(p) p.textContent = info.phone || "Not provided yet";
      if(a) a.textContent = info.address || "Not provided yet";
    } catch(e) {}
  }
}

/* ═══════════════════════════════════════
   DATA LOADING (Products & Settings)
═══════════════════════════════════════ */
function restoreCartFromCache() {
  try {
    const saved = localStorage.getItem("odogwu_cart");
    if(saved) cart = JSON.parse(saved);
  } catch(e) { cart = []; }
  updateCartCount();
}

async function loadSettings() {
  const cached = getCache("odogwu_settings");
  if (cached) { settingsData = cached[0]; whatsappNumber = settingsData.whatsapp_number; } 
  else {
    try {
      const response = await fetch(API_URL, { method: "POST", body: new URLSearchParams({ action: "getSettings" }) });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      setCache("odogwu_settings", result.data);
      settingsData = result.data[0];
      whatsappNumber = settingsData.whatsapp_number;
    } catch (error) { console.error("Failed to load settings:", error); }
  }
}

async function loadProducts() {
  const cached = getCache("odogwu_products");
  if(cached) {
    splitBannersAndProducts(cached); groupProducts(); buildCategories(); renderBanners(); renderProducts(); return;
  }
  try {
    const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "getProducts" }) });
    const result = await response.json();
    if(!result.success) throw new Error(result.error);
    setCache("odogwu_products", result.data);
    splitBannersAndProducts(result.data); groupProducts(); buildCategories(); renderBanners(); renderProducts();
  } catch(error){ console.error(error); }
}

function splitBannersAndProducts(allRows){
  const potentialBanners = allRows.slice(0, 4);
  const productData = allRows.slice(4);
  bannerRows = potentialBanners.filter(row => { const a = (row.availability || "Y").toString().trim().toUpperCase(); return a === "Y" || a === "YES"; });
  rawProducts = productData.filter(p => { const a = (p.availability || "Y").toString().trim().toUpperCase(); return a === "Y" || a === "YES"; });
}

/* ═══════════════════════════════════════
   BANNER LOGIC
═══════════════════════════════════════ */
function renderBanners(){
  const wrapper = document.getElementById("bannerCarousel");
  if(!wrapper) return;
  if(bannerTimer){ clearInterval(bannerTimer); bannerTimer = null; }
  if(!bannerRows.length){ wrapper.style.display = "none"; return; }
  wrapper.style.display = "block";
  wrapper.innerHTML = `
    <div class="banner-track-outer">
      <div class="banner-track" id="bannerTrack">
        ${bannerRows.map((b, i) => `
          <div class="banner-slide" data-index="${i}" onclick="onBannerClick('${escHtml(b.ad_value || "")}')">
            <img src="${escHtml(b.image || "")}" class="banner-img" draggable="false">
          </div>
        `).join("")}
      </div>
      <div class="banner-dots" id="bannerDots">
        ${bannerRows.map((_, i) => `<span class="banner-dot ${i === 0 ? "active" : ""}" onclick="goToBanner(${i})"></span>`).join("")}
      </div>
    </div>`;
  bannerCurrentIndex = 0; updateBannerPosition(); startBannerAutoSwipe(); initBannerSwipe();
}
function updateBannerPosition(){
  const track = document.getElementById("bannerTrack");
  if(!track) return;
  track.style.transform = `translateX(-${bannerCurrentIndex * 100}%)`;
  document.querySelectorAll(".banner-dot").forEach((dot, i) => { dot.classList.toggle("active", i === bannerCurrentIndex); });
}
function goToBanner(index){ bannerCurrentIndex = index; updateBannerPosition(); }
function startBannerAutoSwipe(){ bannerTimer = setInterval(() => { bannerCurrentIndex = (bannerCurrentIndex + 1) % bannerRows.length; updateBannerPosition(); }, BANNER_INTERVAL_MS); }
function initBannerSwipe(){
  const track = document.getElementById("bannerTrack");
  if(!track) return;
  let startX = 0;
  track.addEventListener("touchstart", e => { startX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener("touchend", e => {
    const diff = startX - e.changedTouches[0].clientX;
    if(Math.abs(diff) > 40){
      if(diff > 0) bannerCurrentIndex = (bannerCurrentIndex + 1) % bannerRows.length;
      else bannerCurrentIndex = (bannerCurrentIndex - 1 + bannerRows.length) % bannerRows.length;
      updateBannerPosition();
    }
  }, { passive: true });
}
function onBannerClick(adValue){
  if(!adValue) return;
  if(activeBannerAdValue === adValue){ activeBannerAdValue = null; renderProducts(); return; }
  activeBannerAdValue = adValue; renderProducts();
}
function escHtml(str){ return String(str).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

/* ═══════════════════════════════════════
   PRODUCTS & CATEGORIES LOGIC
═══════════════════════════════════════ */
function groupProducts(){
  const groups = {};
  rawProducts.forEach((p, index) => {
    const cv = (p.card_value || "").toString().trim();
    let groupKey, subIndex;
    if(!cv){ groupKey = "solo" + index; subIndex = 0; } 
    else { const dot = cv.indexOf("."); groupKey = dot === -1 ? cv : cv.slice(0, dot); subIndex = dot === -1 ? 0 : Number(cv.slice(dot + 1)); }
    if(!groups[groupKey]) groups[groupKey] = { id: groupKey, main: null, variants: [] };
    if(subIndex === 0) groups[groupKey].main = p; else groups[groupKey].variants.push({ ...p, _sub: subIndex });
  });
  let bundledCards = Object.values(groups).filter(g => g.main).map(g => ({ ...g, variants: g.variants.sort((a, b) => a._sub - b._sub) }));
  for (let i = bundledCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = bundledCards[i]; bundledCards[i] = bundledCards[j]; bundledCards[j] = temp;
  }
  productCards = bundledCards;
}

function parseCategoriesFromProduct(catStr){
  if(!catStr) return [];
  return String(catStr).split(/[,;|]/).map(c => c.trim()).filter(c => c.length > 0);
}
function buildCategories(){
  const set = new Set();
  rawProducts.forEach(p => { parseCategoriesFromProduct(p.category || "").forEach(cat => set.add(cat)); });
  categories = ["All", ...Array.from(set).sort()];
  renderCategoryChips();
}
function renderCategoryChips(){
  const wrapper = document.getElementById("chipsWrapper");
  const expandedMenu = document.getElementById("categoryExpandedMenu");
  if(!wrapper || !expandedMenu) return;
  wrapper.innerHTML = ""; expandedMenu.innerHTML = "";
  const maxChipsInRow = 4;
  const firstChips = selectedCat !== "All" ? [selectedCat] : ["All"];
  const remainingCategories = categories.filter(c => !firstChips.includes(c));
  firstChips.forEach(cat => {
    const chip = document.createElement("button");
    chip.className = `category-chip ${cat === selectedCat ? "active" : ""}`;
    chip.textContent = cat; chip.onclick = () => selectCategory(cat); wrapper.appendChild(chip);
  });
  for(let i = 0; i < Math.min(maxChipsInRow - firstChips.length, remainingCategories.length); i++){
    const cat = remainingCategories[i];
    const chip = document.createElement("button");
    chip.className = "category-chip"; chip.textContent = cat; chip.onclick = () => selectCategory(cat); wrapper.appendChild(chip);
  }
  const expandBtn = document.getElementById("chipsExpandBtn");
  if(remainingCategories.length > maxChipsInRow - firstChips.length){
    expandBtn.style.display = "flex";
    const hiddenCategories = remainingCategories.slice(maxChipsInRow - firstChips.length);
    hiddenCategories.forEach(cat => {
      const item = document.createElement("button");
      item.className = `category-menu-item ${cat === selectedCat ? "active" : ""}`; item.textContent = cat;
      item.onclick = () => { selectCategory(cat); toggleCategoryExpand(); };
      expandedMenu.appendChild(item);
    });
  } else { expandBtn.style.display = "none"; }
}
function selectCategory(catName){ selectedCat = catName; renderCategoryChips(); renderProducts(); }
function toggleCategoryExpand(){
  document.getElementById("categoryExpandedMenu").classList.toggle("open");
  document.getElementById("chipsExpandBtn").classList.toggle("expanded");
}
function getFiltered(){
  const q = document.getElementById("searchInput").value.toLowerCase().trim();
  return productCards.filter(card => {
    const all = [card.main, ...card.variants];
    if(activeBannerAdValue && !all.some(item => (item.ad_value || "").trim() === activeBannerAdValue.trim())) return false;
    if(selectedCat !== "All" && !all.some(item => parseCategoriesFromProduct(item.category || "").some(cat => cat.trim().toLowerCase() === selectedCat.trim().toLowerCase()))) return false;
    if(q && !all.some(item => (item.product_name || "").toLowerCase().includes(q))) return false;
    return true;
  });
}

function fmt(n){ return Number(n).toLocaleString(); }
function sid(cid){ return String(cid).replace(/[^a-zA-Z0-9_]/g, "_"); }
function parseTags(tagStr){
  if(!tagStr) return [];
  return String(tagStr).split(/[,;|]/).map(t => t.trim()).filter(t => t.length > 0).slice(0, 3);
}

function renderProducts(){
  const container = document.getElementById("products");
  const filtered  = getFiltered();
  container.innerHTML = "";
  if(!filtered.length){ container.innerHTML = `<div style="text-align:center;font-weight:900;padding:40px; grid-column: span 2;">😕 No products found</div>`; return; }
  window._rcards = filtered;
  let htmlContent = "";
  filtered.forEach((card, ri) => {
    const p = card.main, cid = card.id, domId = sid(cid);
    const hasVars = card.variants.length > 0, allVars = [p, ...card.variants], expanded = expandedCards.has(cid);
    
    // Tag parsing
    const tags = parseTags(p.tags || p.tag || p.Tags || "");
    const tagsHTML = tags.length > 0 ? `<div class="product-tags">${tags.map(tag => `<span class="tag-badge">${escHtml(tag)}</span>`).join("")}</div>` : "";
    
    let actionHTML = "";
    if(!hasVars){
      const key = cid + "__solo"; const ci = cart.find(i => i.key === key);
      actionHTML = ci ? `<div class="quantity-box"><button class="qty-btn" onclick="changeQty(${ri},null,-1)">−</button><div style="font-weight:900;">${ci.quantity}</div><button class="qty-btn" onclick="changeQty(${ri},null,1)">+</button></div>` : `<button class="add-btn" onclick="addToCart(${ri},null)">Add To Cart</button>`;
    }
    let variantRows = "";
    allVars.forEach((v, vi) => {
      const key = cid + "__" + vi; const ci = cart.find(i => i.key === key);
      const controls = ci ? `<div class="quantity-box"><button class="qty-btn" onclick="event.stopPropagation();changeQty(${ri},${vi},-1)">−</button><div style="font-weight:900;">${ci.quantity}</div><button class="qty-btn" onclick="event.stopPropagation();changeQty(${ri},${vi},1)">+</button></div>` : `<button class="add-btn" onclick="event.stopPropagation();addToCart(${ri},${vi})">Add</button>`;
      variantRows += `<div class="delivery-option" style="padding:10px;"><div class="product-name">${v.product_name}</div><div class="price" style="font-size:14px;">₦${fmt(v.price)}</div>${controls}</div>`;
    });
    
    htmlContent += `
      <div class="card">
        <div id="normal-${domId}" ${expanded ? 'style="display:none"' : ""}>
          <div class="card-image-wrapper">
            <img class="card-img" src="${p.image}">
            ${tagsHTML}
          </div>
          <div class="card-content">
            <div class="product-name">${p.product_name}</div>
            <div class="description">${p.description}</div>
            <div class="price">₦${fmt(p.price)}</div>
            ${p.initial_price ? `<div class="initial-price">₦${fmt(p.initial_price)}</div>` : ""}
            ${hasVars ? `<button class="add-btn" style="background:#111;" onclick="expandCard(${ri})">View Options</button>` : actionHTML}
          </div>
        </div>
        ${hasVars ? `<div class="card-content" id="expanded-${domId}" style="${expanded ? "display:block" : "display:none"}"><button class="add-btn" style="background:#555; margin-bottom:14px;" onclick="collapseCard(${ri})">◀ Back</button>${variantRows}</div>` : ""}
      </div>
    `;
  });
  container.innerHTML = htmlContent;
}

function expandCard(ri){ const card = window._rcards[ri]; if(!card) return; expandedCards.add(card.id); renderProducts(); }
function collapseCard(ri){ const card = window._rcards[ri]; if(!card) return; expandedCards.delete(card.id); renderProducts(); }

/* ═══════════════════════════════════════
   CART & CHECKOUT LOGIC
═══════════════════════════════════════ */
function addToCart(ri, vi){
  const card = window._rcards[ri]; if(!card) return;
  const cid = card.id; const key = vi !== null ? cid + "__" + vi : cid + "__solo";
  const existing = cart.find(i => i.key === key);
  if(existing){ if(existing.quantity < 100) existing.quantity++; } else { cart.push({ key, cardId: cid, variantIndex: vi, quantity: 1 }); }
  updateCartCount(); renderProducts(); renderCart(); saveCartToCache();
}
function changeQty(ri, vi, delta){
  const card = window._rcards[ri]; if(!card) return;
  const cid = card.id; const key = vi !== null ? cid + "__" + vi : cid + "__solo";
  changeQtyByKey(key, delta);
}

// Allows editing directly inside the Cart UI
function changeQtyByKey(key, delta) {
  const item = cart.find(i => i.key === key);
  if(!item) return;
  item.quantity += delta;
  if(item.quantity <= 0) cart = cart.filter(i => i.key !== key);
  if(item.quantity > 100) item.quantity = 100;
  updateCartCount(); renderProducts(); renderCart(); saveCartToCache();
}

function updateCartCount(){
  let total = 0; cart.forEach(i => { total += i.quantity; });
  document.getElementById("cartCount").textContent = total;
}
function getProductForItem(item){
  const card = productCards.find(c => c.id === item.cardId);
  if(!card) return null;
  return item.variantIndex === null ? card.main : [card.main, ...card.variants][item.variantIndex];
}

function openCart(){ document.getElementById("cartModal").style.display = "flex"; renderCart(); }
function closeCart(){ document.getElementById("cartModal").style.display = "none"; }
// Stop clicks inside the modal box from closing the overlay
document.addEventListener("click", function(event){
  const modal = document.getElementById("cartModal");
  if(event.target === modal) closeCart(); 
});

function renderCart(){
  const el = document.getElementById("cartItems");
  if(!cart.length){ el.innerHTML = `<div style="text-align:center;padding:40px;font-weight:900;">🛒 Your cart is empty</div>`; return; }
  let total = 0; let html = "";
  cart.forEach(item => {
    const p = getProductForItem(item); if(!p) return;
    const sub = Number(p.price) * item.quantity; total += sub;
    html += `
      <div class="cart-item-row">
        <img src="${p.image}">
        <div class="cart-item-info">
          <div class="product-name" style="font-size:14px; margin-bottom:4px;">${p.product_name}</div>
          <div class="price" style="font-size:15px; margin-bottom:8px;">₦${fmt(sub)}</div>
          <div class="quantity-box" style="justify-content: flex-start; margin-top:0;">
            <button class="qty-btn" style="width:28px;height:28px;" onclick="changeQtyByKey('${item.key}', -1)">−</button>
            <div style="font-weight:900; font-size:14px;">${item.quantity}</div>
            <button class="qty-btn" style="width:28px;height:28px;" onclick="changeQtyByKey('${item.key}', 1)">+</button>
          </div>
        </div>
      </div>
    `;
  });
  html += `<div class="summary-box"><div><b>Items Total:</b> ₦${fmt(total)}</div></div>`;
  el.innerHTML = html;
}

function openCheckout(){
  if(!cart.length){ alert("Your cart is empty."); return; }
  document.getElementById("checkoutForm").style.display = "flex";
  // Pre-fill phone number if cached
  const cached = localStorage.getItem("odogwu_user_info");
  if(cached) {
      try { const info = JSON.parse(cached); if(info.phone) document.getElementById("checkoutPhone").value = info.phone; } catch(e){}
  }
}

/* ═══════════════════════════════════════
   DELIVERY API
═══════════════════════════════════════ */
async function findDeliveryInfo() {
  const phoneRaw = document.getElementById("checkoutPhone").value.trim();
  if (!phoneRaw) { latestDeliveryRow = null; renderNoDeliveryFound(); return; }
  showLoading();
  const phone = normalizePhone(phoneRaw);
  try {
    const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "findDelivery", phone: phone }) });
    const result = await response.json();
    if(!result.success) throw new Error(result.error);
    if(result.found && result.data){
      const dataValues = Object.values(result.data).map(v => v !== null ? String(v).trim() : "");
      if (dataValues.some(v => v !== "")) {
        latestDeliveryRow = result.data;
        // Save to cache for the Details Page Section automatically
        cacheUserInfo(
          latestDeliveryRow.name || latestDeliveryRow["Name"] || latestDeliveryRow["name"] || "",
          phoneRaw,
          latestDeliveryRow.address2 || latestDeliveryRow["Address 2"] || latestDeliveryRow["address 2"] || ""
        );
        renderDeliveryUI();
      } else { latestDeliveryRow = null; renderNoDeliveryFound(); }
    } else { latestDeliveryRow = null; renderNoDeliveryFound(); }
  } catch(error){ console.error(error); alert("Failed to load delivery info."); } finally { hideLoading(); }
}

function renderDeliveryUI(){
  const ui = document.getElementById("deliveryUI"); const heading = settingsData.column_k_heading || "Select Delivery Method";
  ui.innerHTML = `
    <div class="delivery-box">
      <div class="delivery-heading">Delivery</div>
      <div class="delivery-subheading">${heading}</div>
      <div class="main-options">
        <button class="main-option" id="mainOption1" onclick="selectMainOption(1)">
          <img src="${settingsData.main_option_1_icon}"><div>${settingsData.main_option_1}</div>
        </button>
        <button class="main-option" id="mainOption2" onclick="selectMainOption(2)">
          <img src="${settingsData.main_option_2_icon}"><div>${settingsData.main_option_2}</div>
        </button>
      </div>
      <div id="subOptions"></div>
    </div>`;
}
function selectMainOption(option){
  selectedMainOption = option; selectedSubOption = null; selectedDeliveryFee = 0;
  document.querySelectorAll(".main-option").forEach(el => el.classList.remove("active"));
  document.getElementById(option === 1 ? "mainOption1" : "mainOption2").classList.add("active");
  renderSubOptions();
}
function renderSubOptions(){
  const container = document.getElementById("subOptions"); if(!latestDeliveryRow) return;
  const options = selectedMainOption === 1 ? DELIVERY_COLUMNS.main1 : DELIVERY_COLUMNS.main2;
  let html = "";
  options.forEach(name => {
    const fee = Number(latestDeliveryRow[name] || 0); const description = DELIVERY_DESCRIPTIONS[name] || "";
    html += `<div class="sub-option-card" onclick="selectSubOption('${name}',${fee})" id="sub-${name.replaceAll(' ','')}"><div class="sub-option-top"><div class="sub-option-name" style="font-size:15px;">${name}</div><div class="sub-option-fee" style="font-size:15px;">₦${fmt(fee)}</div></div></div>`;
  });
  container.innerHTML = html;
}
function selectSubOption(column, fee){
  selectedSubOption = column; selectedDeliveryFee = fee; selectedDeliveryOption = { title: column, fee };
  document.querySelectorAll(".sub-option-card").forEach(el => el.classList.remove("active"));
  document.getElementById("sub-" + column.replaceAll(" ", "")).classList.add("active");
  renderGrandTotal();
}
function renderGrandTotal(){
  let itemsTotal = 0; cart.forEach(item => { const p = getProductForItem(item); if(p) itemsTotal += Number(p.price) * item.quantity; });
  const grandTotal = itemsTotal + selectedDeliveryFee;
  const existing = document.getElementById("grandTotalBox"); if(existing) existing.remove();
  document.getElementById("subOptions").insertAdjacentHTML("beforeend", `
    <div class="grand-total" id="grandTotalBox">
      <div style="margin-bottom:8px; font-size:15px;"><b>Products:</b> ₦${fmt(itemsTotal)}</div>
      <div style="margin-bottom:12px; font-size:15px;"><b>Delivery:</b> ₦${fmt(selectedDeliveryFee)}</div>
      <div style="font-size:18px;font-weight:900;color:#FFBE1A;margin-bottom:16px;">Grand Total: ₦${fmt(grandTotal)}</div>
      <button class="done-btn" onclick="sendWhatsAppOrder(${grandTotal})" style="width:100%;">Done ✅</button>
    </div>
  `);
}
function renderNoDeliveryFound() {
  const ui = document.getElementById("deliveryUI");
  const pickUpFee = Number((settingsData && settingsData.pickup_fee) || 0);
  const pickUpDesc = DELIVERY_DESCRIPTIONS["Pick-up"];
  ui.innerHTML = `
    <div class="delivery-box">
      <div class="delivery-subheading">No delivery record found. Register or choose pickup.</div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:12px;">
        <button class="checkout-btn" onclick="openDeliveryForm()">Fill in delivery details</button>
        <button class="checkout-btn" style="background:#333;" onclick="selectPickUpOption('Pick-up',${pickUpFee},\`${pickUpDesc.replace(/`/g,"\\`")}\`)">Pick-up Option</button>
      </div>
      <div id="pickUpDetails" style="display:none;background:#fff5f5;border-radius:12px;margin-bottom:10px;padding:12px;"></div>
    </div>`;
}
function selectPickUpOption(name, fee, desc){
  selectedDeliveryOption = { title: name, fee };
  const details = document.getElementById("pickUpDetails");
  if(details){
    details.style.display = "block";
    details.innerHTML = `<div style="font-size:18px;font-weight:900;">${name}</div><div style="margin:10px 0;"><b>Fee:</b> ₦${fmt(fee)}</div><button class="done-btn" style="width:100%;" onclick="renderPickUpGrandTotal(${fee});">Continue with Pick-up</button>`;
  }
}
function renderPickUpGrandTotal(fee){
  let itemsTotal = 0; cart.forEach(item => { const p = getProductForItem(item); if(p) itemsTotal += Number(p.price) * item.quantity; });
  const grandTotal = itemsTotal + fee;
  const details = document.getElementById("pickUpDetails");
  if(details){
    details.innerHTML += `
      <div class="grand-total" style="margin-top:16px;">
        <div style="margin-bottom:8px; font-size:14px;"><b>Products:</b> ₦${fmt(itemsTotal)}</div>
        <div style="margin-bottom:8px; font-size:14px;"><b>Delivery:</b> ₦${fmt(fee)}</div>
        <div style="font-size:18px;font-weight:900;color:#FFBE1A;margin-bottom:10px;">Grand Total: ₦${fmt(grandTotal)}</div>
        <button class="done-btn" style="width:100%;" onclick="sendWhatsAppOrder(${grandTotal})">Done ✅</button>
      </div>`;
  }
  selectedDeliveryOption = { title: "Pick-up", fee };
}

/* ═══════════════════════════════════════
   PWA FORM (IFRAME)
═══════════════════════════════════════ */
function openDeliveryForm() {
  let formModal = document.getElementById("pwaFormModal");
  if (!formModal) {
    formModal = document.createElement("div"); formModal.id = "pwaFormModal";
    formModal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); z-index:99999; display:flex; align-items:center; justify-content:center; padding:12px; box-sizing:border-box;";
    document.body.appendChild(formModal);
  }
  formModal.innerHTML = `
    <div style="background:#ffffff; width:100%; max-width:520px; height:85vh; border-radius:24px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 12px 35px rgba(0,0,0,0.4);">
      <div style="padding:16px 20px; background:#FFBE1A; display:flex; justify-content:space-between; align-items:center;">
        <span style="color:#111; font-weight:900; font-size:16px;">📋 Delivery Details</span>
        <button onclick="closeDeliveryFormModal()" style="background:none; border:none; color:#111; font-size:24px; cursor:pointer; font-weight:900;">✕</button>
      </div>
      <iframe src="${DELIVERY_FORM_LINK}" style="width:100%; flex:1; border:none; background:#ffffff;"></iframe>
    </div>`;
  formModal.style.display = "flex";
}

function closeDeliveryFormModal() {
  const formModal = document.getElementById("pwaFormModal");
  if (formModal) formModal.style.display = "none";
  // Attempt to refresh data silently so it caches their new input
  const phoneInput = document.getElementById("checkoutPhone");
  if (phoneInput && phoneInput.value.trim() !== "") findDeliveryInfo();
}

/* ═══════════════════════════════════════
   SUBMITTING ORDER
═══════════════════════════════════════ */
async function sendWhatsAppOrder(grandTotal){
  if(!selectedDeliveryOption){ alert("Please select a delivery option."); return; }
  const customerPhone = normalizePhone(document.getElementById("checkoutPhone").value);
  let customerName = "New Customer", fetchedAddress1 = "", fetchedAddress2 = "";
  if (latestDeliveryRow) {
    customerName = latestDeliveryRow.name || latestDeliveryRow["Name"] || latestDeliveryRow["name"] || "Valued Customer";
    fetchedAddress1 = latestDeliveryRow.address1 || latestDeliveryRow["Address 1"] || latestDeliveryRow["address 1"] || "";
    fetchedAddress2 = latestDeliveryRow.address2 || latestDeliveryRow["Address 2"] || latestDeliveryRow["address 2"] || "";
  }
  let itemsTotal = 0, formattedProductsList = "PRODUCTNAME------QTY", msg = "🛒 *NEW ORDER*%0A%0A━━━━━━━━━━━━━━%0A🛍️ *ITEMS:*%0A";
  cart.forEach(item => {
    const product = getProductForItem(item); if(!product) return;
    const subtotal = Number(product.price) * item.quantity; itemsTotal += subtotal;
    formattedProductsList += `\n${product.product_name}------${item.quantity}`;
    msg += "%0A🔹 *" + product.product_name + "*%0AQty: " + item.quantity + "%0ASubtotal: ₦" + fmt(subtotal) + "%0A";
  });
  const mainOption = selectedMainOption === 1 ? settingsData.main_option_1 : settingsData.main_option_2;
  msg += "%0A━━━━━━━━━━━━━━%0A🚛 Main Option: " + mainOption + "%0A🚚 Delivery: " + selectedDeliveryOption.title + "%0A🚚 Delivery Fee: ₦" + fmt(selectedDeliveryOption.fee) + "%0A%0A💰 *Grand Total: ₦" + fmt(grandTotal) + "*";
  showLoading();
  const isSaved = await saveOrderToSheet4({
    timestamp: new Date().toISOString(), name: customerName, phone: customerPhone, selected_main_option: mainOption,
    selected_sub_option: selectedDeliveryOption.title, address_1: fetchedAddress1, address_2: fetchedAddress2,
    products: formattedProductsList, items_total: itemsTotal, delivery_fee: selectedDeliveryOption.fee, grand_total: grandTotal
  });
  hideLoading();
  if (isSaved) {
    cart = []; updateCartCount(); localStorage.removeItem("odogwu_cart");
    document.getElementById("checkoutForm").style.display = "none"; closeCart(); 
    const safeMsg = encodeURIComponent(msg.replace(/%0A/g, '\n'));
    const waLink = "https://wa.me/" + whatsappNumber + "?text=" + safeMsg;
    window.location.href = waLink;
  } else { alert("Issue processing order. Please check connection."); }
}

async function saveOrderToSheet4(orderData){
  try {
    const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveOrder", order: orderData }) });
    const result = await response.json(); return result.success;
  } catch(error){ return false; }
}

/* ═══════════════════════════════════════
   START ENGINE
═══════════════════════════════════════ */

function isIos() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

function isStandalone() {
  return ('standalone' in window.navigator) && (window.navigator.standalone);
}

// Update your UI Logic
if (isIos() && !isStandalone()) {
  // Show a specific "How to Install" button for iOS users
  const installBtn = document.getElementById('installPwaBtn');
  if (installBtn) {
    installBtn.style.display = 'flex';
    installBtn.innerText = "Install: Tap Share → Add to Home Screen";
  }
}


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
let deferredPrompt; const installBtn = document.getElementById('installPwaBtn');
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (installBtn) installBtn.style.display = 'flex'; });
if (installBtn) { installBtn.addEventListener('click', async () => { if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; installBtn.style.display = 'none'; } }); }
window.addEventListener('appinstalled', () => { if (installBtn) installBtn.style.display = 'none'; });

init();
