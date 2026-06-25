/* ═══════════════════════════════════════
   CONFIG
═══════════════════════════════════════ */

const API_URL =
"https://project-invie.vercel.app/api/store";

/* DELIVERY FORM */

const DELIVERY_FORM_LINK =
"https://docs.google.com/forms/d/e/1FAIpQLSc3_zXePFiNo5AJlryelaXK7iVG34_LBh90TJIVqms-nUmMLQ/viewform?usp=dialog";

const DELIVERY_COLUMNS = {

  main1: [
    "Home Delivery",
    "Nearby Delivery",
    "Pick-up"
  ],

  main2: [
    "Home Delivery-2",
    "Nearby Delivery-2",
    "Pick-up"
  ]

};

const DELIVERY_DESCRIPTIONS = {

  "Home Delivery":
    "Delivered directly to your address",

  "Nearby Delivery":
    "Pickup from nearby location",

  "Home Delivery-2":
    "Delivered directly to your address",

  "Nearby Delivery-2":
    "Pickup from nearby location",

  "Pick-up":
    "Pickup from our shop at nitel junction"

};

const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

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

function setCache(key, data) {
  localStorage.setItem(key, JSON.stringify({
    timestamp: Date.now(),
    data
  }));
}

function saveCartToCache(){
  localStorage.setItem(
    "odogwu_cart",
    JSON.stringify(cart)
  );
}

function showLoading() {
  document.getElementById("loadingOverlay").style.display = "flex";
}
function hideLoading() {
  document.getElementById("loadingOverlay").style.display = "none";
}

function normalizePhone(phone){

  phone = phone
    .toString()
    .trim()
    .replace(/\s+/g,"")
    .replace(/\-/g,"");

  if(phone.startsWith("+234")){
    phone = "0" + phone.slice(4);
  } else if(phone.startsWith("234")){
    phone = "0" + phone.slice(3);
  }

  return phone;

}


/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */

let rawProducts   = [];
let bannerRows    = [];   // first 4 rows used as banners
let productCards  = [];
let cart          = [];
let whatsappNumber = "";
let selectedCat   = "All";
let categories    = [];
let expandedCards = new Set();
let selectedDeliveryOption = null;
let selectedMainOption     = null;
let selectedSubOption      = null;
let selectedDeliveryFee    = 0;
let latestDeliveryRow      = null;
let settingsData           = null;

/* ── Banner state ── */
let activeBannerAdValue  = null;  // ad_value currently filtering products (null = show all)
let bannerCurrentIndex   = 0;     // which banner is visible in the carousel
let bannerTimer          = null;  // auto-swipe interval handle
const BANNER_INTERVAL_MS = 3500;  // auto-swipe every 3.5 s


/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */

async function init() {
  restoreCartFromCache();
  showLoading();
  await Promise.all([
    loadSettings(),
    loadProducts()
  ]);
  hideLoading();
}

function restoreCartFromCache(){
  try {
    const saved = localStorage.getItem("odogwu_cart");
    if(saved){
      cart = JSON.parse(saved);
    }
  } catch(e){
    cart = [];
  }
  updateCartCount();
}

async function loadSettings() {
  const cacheKey = "odogwu_settings";
  const cached   = getCache(cacheKey);

  // 1. Get the data (either from Cache OR from Network)
  if (cached) {
    // We have cached data! Load it.
    settingsData   = cached[0];
    whatsappNumber = settingsData.whatsapp_number;
  } else {
    // No cache found. Fetch from the backend.
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        body:   new URLSearchParams({ action: "getSettings" })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      setCache(cacheKey, result.data);
      settingsData   = result.data[0];
      whatsappNumber = settingsData.whatsapp_number;
    } catch (error) {
      console.error("Failed to load settings:", error);
      return; // Exit if network fails completely
    }
  }

  if (settingsData) {
    if (settingsData.filter_icon) {
      const catIconEl = document.getElementById("categoryIcon");
      if(catIconEl) {
        catIconEl.src = settingsData.filter_icon;
        catIconEl.style.display = "block";
        document.getElementById("catFallback").style.display = "none";
      }
    }

    if (settingsData.cart_icon) {
      const cartIconEl = document.getElementById("cartIcon");
      if(cartIconEl) {
        cartIconEl.src = settingsData.cart_icon;
        cartIconEl.style.display = "block";
        document.getElementById("cartFallback").style.display = "none";
      }
    }
  }
}

async function loadProducts() {

  const cacheKey = "odogwu_products";
  const cached   = getCache(cacheKey);

  if(cached){
    splitBannersAndProducts(cached);
    groupProducts();
    buildCategories();
    renderBanners();
    renderProducts();
    return;
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action: "getProducts" })
    });

    const result = await response.json();

    if(!result.success){
      throw new Error(result.error);
    }

    setCache(cacheKey, result.data);
    splitBannersAndProducts(result.data);
    groupProducts();
    buildCategories();
    renderBanners();
    renderProducts();

  } catch(error){
    console.error(error);
  }

}


/* ═══════════════════════════════════════
   SPLIT: BANNERS vs PRODUCTS
   ─────────────────────────────────────
   • The first 4 rows of Sheet1 are banner
     rows. We identify them by checking if
     the row has an ad_value that starts with
     "ad" AND no card_value (they are not
     product cards).
   • Alternatively we simply slice the raw
     data: rows[0..3] = banners, rest = products.
   • We then filter banners by availability
     (Y/YES) same way products are filtered.
═══════════════════════════════════════ */

function splitBannersAndProducts(allRows){

  // First 4 rows → potential banners
  const potentialBanners = allRows.slice(0, 4);
  const productData      = allRows.slice(4);

  // Filter banners by availability
  bannerRows = potentialBanners.filter(row => {
    const a = (row.availability || "Y")
      .toString().trim().toUpperCase();
    return a === "Y" || a === "YES";
  });

  // Filter products by availability
  rawProducts = productData.filter(p => {
    const a = (p.availability || "Y")
      .toString().trim().toUpperCase();
    return a === "Y" || a === "YES";
  });

}


/* ═══════════════════════════════════════
   BANNER CAROUSEL
═══════════════════════════════════════ */

function renderBanners(){

  const wrapper = document.getElementById("bannerCarousel");

  if(!wrapper) return;

  // Clear any existing timer
  if(bannerTimer){
    clearInterval(bannerTimer);
    bannerTimer = null;
  }

  if(!bannerRows.length){
    wrapper.style.display = "none";
    return;
  }

  wrapper.style.display = "block";

  // Build carousel HTML
  wrapper.innerHTML = `
    <div class="banner-track-outer">

      <div class="banner-track" id="bannerTrack">
        ${bannerRows.map((b, i) => `
          <div
            class="banner-slide"
            data-index="${i}"
            data-advalue="${b.ad_value || ""}"
            onclick="onBannerClick('${escHtml(b.ad_value || "")}')"
            title="Tap to view ${escHtml(b.product_name || "")}"
          >
            <img
              src="${escHtml(b.image || "")}"
              alt="${escHtml(b.product_name || "")}"
              class="banner-img"
              draggable="false"
            >
          </div>
        `).join("")}
      </div>

      <div class="banner-dots" id="bannerDots">
        ${bannerRows.map((_, i) => `
          <span
            class="banner-dot ${i === 0 ? "active" : ""}"
            onclick="goToBanner(${i})"
          ></span>
        `).join("")}
      </div>

    </div>
  `;

  // Reset index and start auto-swipe
  bannerCurrentIndex = 0;
  updateBannerPosition();
  startBannerAutoSwipe();

  // Touch / swipe support
  initBannerSwipe();

}

function updateBannerPosition(){

  const track = document.getElementById("bannerTrack");
  if(!track) return;

  track.style.transform =
    `translateX(-${bannerCurrentIndex * 100}%)`;

  // Update dots
  document
    .querySelectorAll(".banner-dot")
    .forEach((dot, i) => {
      dot.classList.toggle("active", i === bannerCurrentIndex);
    });

}

function goToBanner(index){
  bannerCurrentIndex = index;
  updateBannerPosition();
}

function startBannerAutoSwipe(){
  bannerTimer = setInterval(() => {
    bannerCurrentIndex =
      (bannerCurrentIndex + 1) % bannerRows.length;
    updateBannerPosition();
  }, BANNER_INTERVAL_MS);
}

/* Touch swipe on banner */
function initBannerSwipe(){

  const track = document.getElementById("bannerTrack");
  if(!track) return;

  let startX = 0;

  track.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
  }, { passive: true });

  track.addEventListener("touchend", e => {
    const diff = startX - e.changedTouches[0].clientX;
    if(Math.abs(diff) > 40){
      if(diff > 0){
        // swipe left → next
        bannerCurrentIndex =
          (bannerCurrentIndex + 1) % bannerRows.length;
      } else {
        // swipe right → prev
        bannerCurrentIndex =
          (bannerCurrentIndex - 1 + bannerRows.length) % bannerRows.length;
      }
      updateBannerPosition();
    }
  }, { passive: true });

}

/* ─── Banner click → filter products by ad_value ─── */

function onBannerClick(adValue){

  if(!adValue){
    return;
  }

  if(activeBannerAdValue === adValue){
    // Tapping same banner again → clear filter
    clearBannerFilter();
    return;
  }

  activeBannerAdValue = adValue;

  // Show a clear-filter pill so user can return to all products
  showBannerFilterLabel(adValue);

  // Re-render products filtered by this ad_value
  renderProducts();

}

function clearBannerFilter(){

  activeBannerAdValue = null;

  const pill = document.getElementById("bannerFilterPill");
  if(pill) pill.remove();

  renderProducts();

}

function showBannerFilterLabel(adValue){

  // Find banner name for this adValue
  const banner = bannerRows.find(
    b => (b.ad_value || "").trim() === adValue.trim()
  );
  const label = banner ? banner.product_name : adValue;

  let pill = document.getElementById("bannerFilterPill");

  if(!pill){
    pill = document.createElement("div");
    pill.id = "bannerFilterPill";
    pill.className = "banner-filter-pill";

    // Insert pill above products
    const productsEl = document.getElementById("products");
    productsEl.parentNode.insertBefore(pill, productsEl);
  }

  pill.innerHTML = `
    <span>Showing: <b>${escHtml(label)}</b></span>
    <button onclick="clearBannerFilter()">✕ Clear</button>
  `;

}

/* HTML-escape helper (used in banner rendering) */
function escHtml(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}


/* ═══════════════════════════════════════
   GROUP & RANDOMIZE PRODUCTS
═══════════════════════════════════════ */

function groupProducts(){

  const groups = {};

  rawProducts.forEach((p, index) => {

    const cv = (p.card_value || "").toString().trim();
    let groupKey, subIndex;

    if(!cv){
      groupKey = "solo" + index;
      subIndex = 0;
    } else {
      const dot = cv.indexOf(".");
      groupKey   = dot === -1 ? cv : cv.slice(0, dot);
      subIndex   = dot === -1 ? 0  : Number(cv.slice(dot + 1));
    }

    if(!groups[groupKey]){
      groups[groupKey] = { id: groupKey, main: null, variants: [] };
    }

    if(subIndex === 0){
      groups[groupKey].main = p;
    } else {
      groups[groupKey].variants.push({ ...p, _sub: subIndex });
    }

  });

  // 1. First assemble your structured product cards array as usual
  let bundledCards = Object.values(groups)
    .filter(g => g.main)
    .map(g => ({
      ...g,
      variants: g.variants.sort((a, b) => a._sub - b._sub)
    }));

  // 2. Fisher-Yates Shuffle Algorithm: Randomize the array cleanly in-place
  for (let i = bundledCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Swap elements
    const temp = bundledCards[i];
    bundledCards[i] = bundledCards[j];
    bundledCards[j] = temp;
  }

  // 3. Save the completely randomized collection back to your state
  productCards = bundledCards;
}


/* ═══════════════════════════════════════
   CATEGORIES
═══════════════════════════════════════ */

function buildCategories(){

  const set = new Set();

  rawProducts.forEach(p => {
    if(p.category) set.add(p.category.trim());
  });

  categories = ["All", ...Array.from(set)];

  document.getElementById("catDropdown").innerHTML =
    categories.map((c, index) => `
      <div class="cat-option" onclick="selectCategory(${index})">
        ${c}
      </div>
    `).join("");

}

function selectCategory(index){
  selectedCat = categories[index];
  
  // 1. Safe Null-Check: Only update the label text if the element actually exists
  const catLabelEl = document.getElementById("catLabel");
  if (catLabelEl) {
    catLabelEl.textContent = selectedCat;
  }
  
  // 2. Usability Fix: Automatically close the dropdown after clicking an option
  const catDropdownEl = document.getElementById("catDropdown");
  if (catDropdownEl) {
    catDropdownEl.classList.remove("open");
  }
  
  renderProducts();
}

function toggleCatDropdown(){
  document.getElementById("catDropdown").classList.toggle("open");
}

document.addEventListener("click", function(e){
  const wrapper = document.querySelector(".cat-wrapper");
  if(!wrapper.contains(e.target)){
    document.getElementById("catDropdown").classList.remove("open");
  }
});


/* ═══════════════════════════════════════
   FILTER
   ─────────────────────────────────────
   Now respects activeBannerAdValue in
   addition to category and search query.
═══════════════════════════════════════ */

function getFiltered(){

  const q = document
    .getElementById("searchInput")
    .value.toLowerCase().trim();

  return productCards.filter(card => {

    const all = [card.main, ...card.variants];

    /* ── Banner ad_value filter ── */
    if(activeBannerAdValue){
      const hasAdMatch = all.some(item =>
        (item.ad_value || "").trim() === activeBannerAdValue.trim()
      );
      if(!hasAdMatch) return false;
    }

    /* ── Category filter ── */
    if(selectedCat !== "All" && !all.some(item =>
      (item.category || "").trim() === selectedCat
    )){
      return false;
    }

    /* ── Search filter ── */
    if(q && !all.some(item =>
      (item.product_name || "").toLowerCase().includes(q)
    )){
      return false;
    }

    return true;

  });

}


/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */

function fmt(n){
  return Number(n).toLocaleString();
}

function sid(cid){
  return String(cid).replace(/[^a-zA-Z0-9_]/g, "_");
}


/* ═══════════════════════════════════════
   RENDER PRODUCTS
═══════════════════════════════════════ */

function renderProducts(){
  const container = document.getElementById("products");
  const filtered  = getFiltered();
  container.innerHTML = "";

  if(!filtered.length){
    container.innerHTML = `
      <div style="text-align:center;font-weight:800;padding:40px;">
        😕 No products found
      </div>
    `;
    return;
  }

  window._rcards = filtered;

  // 3. Performance Fix: Store everything in a temporary string in-memory
  let htmlContent = "";

  filtered.forEach((card, ri) => {
    const p      = card.main;
    const cid    = card.id;
    const domId  = sid(cid);
    const hasVars = card.variants.length > 0;
    const allVars = [p, ...card.variants];
    const expanded = expandedCards.has(cid);

    let actionHTML = "";

    if(!hasVars){
      const key = cid + "__solo";
      const ci  = cart.find(i => i.key === key);

      actionHTML = ci
        ? `
          <div class="quantity-box">
            <button class="qty-btn" onclick="changeQty(${ri},null,-1)">−</button>
            <div>${ci.quantity}</div>
            <button class="qty-btn" onclick="changeQty(${ri},null,1)">+</button>
          </div>
        `
        : `
          <button class="add-btn" onclick="addToCart(${ri},null)">Add To Cart</button>
        `;
    }

    let variantRows = "";

    allVars.forEach((v, vi) => {
      const key = cid + "__" + vi;
      const ci  = cart.find(i => i.key === key);

      const controls = ci
        ? `
          <div class="quantity-box">
            <button class="qty-btn" onclick="event.stopPropagation();changeQty(${ri},${vi},-1)">−</button>
            <div>${ci.quantity}</div>
            <button class="qty-btn" onclick="event.stopPropagation();changeQty(${ri},${vi},1)">+</button>
          </div>
        `
        : `
          <button class="add-btn" onclick="event.stopPropagation();addToCart(${ri},${vi})">Add</button>
        `;

      variantRows += `
        <div class="delivery-option">
          <div class="product-name">${v.product_name}</div>
          <div class="price">₦${fmt(v.price)}</div>
          <div style="margin-top:12px;">${controls}</div>
        </div>
      `;
    });

    // Accumulate the HTML layouts together inside memory
    htmlContent += `
      <div class="card">
        <div id="normal-${domId}" ${expanded ? 'style="display:none"' : ""}>
          <img class="card-img" src="${p.image}">
          <div class="card-content">
            <div class="product-name">${p.product_name}</div>
            <div class="description">${p.description}</div>
            <div class="price">₦${fmt(p.price)}</div>
            ${p.initial_price ? `<div class="initial-price">₦${fmt(p.initial_price)}</div>` : ""}
            <div style="height:14px;"></div>
            ${hasVars ? `<button class="checkout-btn" onclick="expandCard(${ri})">View Variants</button>` : actionHTML}
          </div>
        </div>

        ${hasVars
          ? `
            <div class="card-content" id="expanded-${domId}" style="${expanded ? "display:block" : "display:none"}">
              <button class="checkout-btn" style="margin-bottom:14px;" onclick="collapseCard(${ri})">◀ Back</button>
              ${variantRows}
            </div>
          `
          : ""}
      </div>
    `;
  });

  // Send the finished structure to the visual screen layout exactly ONCE
  container.innerHTML = htmlContent;
}


/* ═══════════════════════════════════════
   EXPAND / COLLAPSE
═══════════════════════════════════════ */

function expandCard(ri){
  const card = window._rcards[ri];
  if(!card) return;
  expandedCards.add(card.id);
  renderProducts();
}

function collapseCard(ri){
  const card = window._rcards[ri];
  if(!card) return;
  expandedCards.delete(card.id);
  renderProducts();
}


/* ═══════════════════════════════════════
   CART
═══════════════════════════════════════ */

function addToCart(ri, vi){

  const card = window._rcards[ri];
  if(!card) return;

  const cid = card.id;
  const key = vi !== null ? cid + "__" + vi : cid + "__solo";

  const existing = cart.find(i => i.key === key);

  if(existing){
    if(existing.quantity < 100) existing.quantity++;
  } else {
    cart.push({ key, cardId: cid, variantIndex: vi, quantity: 1 });
  }

  updateCartCount();
  renderProducts();
  saveCartToCache();

}

function changeQty(ri, vi, delta){

  const card = window._rcards[ri];
  if(!card) return;

  const cid  = card.id;
  const key  = vi !== null ? cid + "__" + vi : cid + "__solo";
  const item = cart.find(i => i.key === key);

  if(!item) return;

  item.quantity += delta;

  if(item.quantity <= 0){
    cart = cart.filter(i => i.key !== key);
  }

  if(item.quantity > 100){
    item.quantity = 100;
  }

  updateCartCount();
  renderProducts();
  saveCartToCache();

}

function updateCartCount(){
  let total = 0;
  cart.forEach(i => { total += i.quantity; });
  document.getElementById("cartCount").textContent = total;
}

function getProductForItem(item){
  const card = productCards.find(c => c.id === item.cardId);
  if(!card) return null;
  if(item.variantIndex === null) return card.main;
  return [card.main, ...card.variants][item.variantIndex];
}


/* ═══════════════════════════════════════
   CART MODAL
═══════════════════════════════════════ */

function openCart(){
  document.getElementById("cartModal").style.display = "flex";
  renderCart();
}

function closeCart(){
  document.getElementById("cartModal").style.display = "none";
}

window.onclick = function(event){
  const modal = document.getElementById("cartModal");
  if(event.target === modal) closeCart();
};


/* ═══════════════════════════════════════
   RENDER CART
═══════════════════════════════════════ */

function renderCart(){

  const el = document.getElementById("cartItems");

  if(!cart.length){
    el.innerHTML = `
      <div style="text-align:center;padding:40px;font-weight:800;">
        🛒 Your cart is empty
      </div>
    `;
    return;
  }

  let total = 0;
  let html  = "";

  cart.forEach(item => {

    const p = getProductForItem(item);
    if(!p) return;

    const sub = Number(p.price) * item.quantity;
    total += sub;

    html += `
      <div class="cart-item-row">
        <img src="${p.image}">
        <div>
          <div class="product-name">${p.product_name}</div>
          <div class="description">₦${fmt(p.price)} × ${item.quantity}</div>
          <div class="price">₦${fmt(sub)}</div>
        </div>
      </div>
    `;

  });

  html += `
    <div class="summary-box">
      <div><b>Items Total:</b> ₦${fmt(total)}</div>
    </div>
  `;

  el.innerHTML = html;

}


/* ═══════════════════════════════════════
   CHECKOUT
═══════════════════════════════════════ */

function openCheckout(){
  if(!cart.length){
    alert("Your cart is empty.");
    return;
  }
  document.getElementById("checkoutForm").style.display = "flex";
}


/* ═══════════════════════════════════════
   FIND DELIVERY INFO
═══════════════════════════════════════ */

async function findDeliveryInfo() {

  showLoading();

  const phone = normalizePhone(
    document.getElementById("checkoutPhone").value
  );

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        action: "findDelivery", 
        phone: phone 
      })
    });

    const result = await response.json();

    if(!result.success){
      throw new Error(result.error);
    }

    if(result.found && result.data){
      latestDeliveryRow = result.data;
      renderDeliveryUI();
    } else {
      latestDeliveryRow = null;
      renderNoDeliveryFound();
    }

  } catch(error){

    console.error(error);
    alert("Failed to load delivery info.");

  } finally {

    hideLoading();

  }

}

function renderDeliveryUI(){

  const ui      = document.getElementById("deliveryUI");
  const heading = settingsData.column_k_heading || "Select Delivery Method";

  ui.innerHTML = `
    <div class="delivery-box">

      <div class="delivery-heading">Delivery</div>
      <div class="delivery-subheading">${heading}</div>

      <div class="main-options">

        <button class="main-option" id="mainOption1" onclick="selectMainOption(1)">
          <img src="${settingsData.main_option_1_icon}">
          <div>${settingsData.main_option_1}</div>
          <div>${settingsData.main_option_1_description}</div>
        </button>

        <button class="main-option" id="mainOption2" onclick="selectMainOption(2)">
          <img src="${settingsData.main_option_2_icon}">
          <div>${settingsData.main_option_2}</div>
          <div>${settingsData.main_option_2_description}</div>
        </button>

      </div>

      <div id="subOptions"></div>

    </div>
  `;

}

function selectMainOption(option){

  selectedMainOption  = option;
  selectedSubOption   = null;
  selectedDeliveryFee = 0;

  document.querySelectorAll(".main-option").forEach(el =>
    el.classList.remove("active")
  );

  document.getElementById(
    option === 1 ? "mainOption1" : "mainOption2"
  ).classList.add("active");

  renderSubOptions();

}

function renderSubOptions(){

  const container = document.getElementById("subOptions");
  if(!latestDeliveryRow) return;

  const options = selectedMainOption === 1
    ? DELIVERY_COLUMNS.main1
    : DELIVERY_COLUMNS.main2;

  let html = "";

  options.forEach(name => {

    const fee         = Number(latestDeliveryRow[name] || 0);
    const description = DELIVERY_DESCRIPTIONS[name] || "";

    html += `
      <div class="sub-option-card"
           onclick="selectSubOption('${name}',${fee})"
           id="sub-${name.replaceAll(' ','')}">
        <div class="sub-option-top">
          <div class="sub-option-name">${name}</div>
          <div class="sub-option-fee">₦${fmt(fee)}</div>
        </div>
        <div class="sub-option-desc">${description}</div>
      </div>
    `;

  });

  container.innerHTML = html;

}

function selectSubOption(column, fee){

  selectedSubOption       = column;
  selectedDeliveryFee     = fee;
  selectedDeliveryOption  = { title: column, fee };

  document.querySelectorAll(".sub-option-card").forEach(el =>
    el.classList.remove("active")
  );

  document.getElementById(
    "sub-" + column.replaceAll(" ", "")
  ).classList.add("active");

  renderGrandTotal();

}

function renderGrandTotal(){

  let itemsTotal = 0;

  cart.forEach(item => {
    const product = getProductForItem(item);
    if(!product) return;
    itemsTotal += Number(product.price) * item.quantity;
  });

  const grandTotal = itemsTotal + selectedDeliveryFee;

  const existing = document.getElementById("grandTotalBox");
  if(existing) existing.remove();

  document.getElementById("subOptions").insertAdjacentHTML("beforeend", `
    <div class="grand-total" id="grandTotalBox">
      <div style="margin-bottom:12px;"><b>Products:</b> ₦${fmt(itemsTotal)}</div>
      <div style="margin-bottom:12px;"><b>Delivery:</b> ₦${fmt(selectedDeliveryFee)}</div>
      <div style="font-size:22px;font-weight:900;color:#0a8a0a;margin-bottom:20px;">
        Grand Total: ₦${fmt(grandTotal)}
      </div>
      <button class="done-btn" onclick="sendWhatsAppOrder(${grandTotal})" style="width:100%;">
        Done ✅
      </button>
    </div>
  `);

}

function renderNoDeliveryFound() {

  const ui = document.getElementById("deliveryUI");

  /* Pick-up fee for users with no delivery record.
     Read from settingsData if a key is provided,
     otherwise fall back to 0.                     */
  const pickUpFee =
    Number(
      (settingsData && settingsData.pickup_fee) || 0
    );
  const pickUpDesc = DELIVERY_DESCRIPTIONS["Pick-up"];

  ui.innerHTML = `
    <div class="delivery-box">

      <div class="delivery-heading">Delivery</div>
      <div class="delivery-subheading">
        No delivery record found for this phone number.
        Please choose an option below:
      </div>

      <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:26px;">
        <button class="checkout-btn" style="flex:1;min-width:140px;"
                onclick="openDeliveryForm()">
          Fill in your delivery details
        </button>
        <button class="checkout-btn" style="flex:1;min-width:140px;background:#333;"
                onclick="selectPickUpOption('Pick-up',${pickUpFee},\`${pickUpDesc.replace(/`/g,"\\`")}\`)">
          Pick-up Option<br><small><b>Pick-up</b></small>
        </button>
      </div>

      <div id="pickUpDetails" style="display:none;background:#fff5f5;border:2px solid #FC0606;border-radius:16px;margin-bottom:13px;padding:16px;"></div>

    </div>
  `;
}

function selectPickUpOption(name, fee, desc){

  selectedDeliveryOption = { title: name, fee };

  const details = document.getElementById("pickUpDetails");
  if(details){
    details.style.display = "block";
    details.innerHTML = `
      <div style="font-size:21px;font-weight:900;">${name}</div>
      <div style="margin:10px 0 6px 0;"><b>Fee:</b> ₦${fmt(fee)}</div>
      <div style="font-size:15px;">${desc || ""}</div>
      <div style="margin-top:14px;">
        <button class="done-btn" style="width:100%;" onclick="renderPickUpGrandTotal(${fee});">
          Continue with Pick-up
        </button>
      </div>
    `;
  }

}

function renderPickUpGrandTotal(fee){

  let itemsTotal = 0;
  cart.forEach(item => {
    const product = getProductForItem(item);
    if(!product) return;
    itemsTotal += Number(product.price) * item.quantity;
  });

  const grandTotal = itemsTotal + fee;

  const details = document.getElementById("pickUpDetails");
  if(details){
    details.innerHTML += `
      <div class="grand-total" style="margin-top:16px;">
        <div style="margin-bottom:8px;"><b>Products:</b> ₦${fmt(itemsTotal)}</div>
        <div style="margin-bottom:8px;"><b>Delivery:</b> ₦${fmt(fee)}</div>
        <div style="font-size:22px;font-weight:900;color:#0a8a0a;margin-bottom:10px;">
          Grand Total: ₦${fmt(grandTotal)}
        </div>
        <button class="done-btn" style="width:100%;" onclick="sendWhatsAppOrder(${grandTotal})">
          Done ✅
        </button>
      </div>
    `;
  }

  selectedDeliveryOption = { title: "Pick-up", fee };

}


/* ═══════════════════════════════════════
   IN-APP PWA FORM MODAL
═══════════════════════════════════════ */

function openDeliveryForm() {
  // Check if the modal element already exists, if not, create it dynamically
  let formModal = document.getElementById("pwaFormModal");
  
  if (!formModal) {
    formModal = document.createElement("div");
    formModal.id = "pwaFormModal";
    // Setup full screen darkened overlay layout background
    formModal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); z-index:9999; display:flex; align-items:center; justify-content:center; padding:12px; box-sizing:border-box;";
    document.body.appendChild(formModal);
  }

  // Inject standard clean layout container with responsive styling parameters
  formModal.innerHTML = `
    <div style="background:#ffffff; width:100%; max-width:520px; height:85vh; border-radius:20px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 12px 35px rgba(0,0,0,0.4); animation: fadeIn 0.2s ease-out;">
      
      <div style="padding:16px 20px; background:#111111; display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #FFBE1A;">
        <span style="color:#FFBE1A; font-weight:800; font-size:16px; font-family:'Nunito',sans-serif;">📋 Register Delivery Details</span>
        <button onclick="closeDeliveryFormModal()" style="background:none; border:none; color:#FFBE1A; font-size:20px; cursor:pointer; font-weight:900; padding:4px 8px;">✕</button>
      </div>
      
      <iframe src="${DELIVERY_FORM_LINK}" style="width:100%; flex:1; border:none; background:#ffffff;">
        Loading Form...
      </iframe>
      
    </div>
  `;
  
  formModal.style.display = "flex";
}

function closeDeliveryFormModal() {
  const formModal = document.getElementById("pwaFormModal");
  if (formModal) {
    formModal.style.display = "none";
  }
  
  // UX Optimization: Re-check the verification endpoint automatically 
  // so the system can catch their data as soon as they close the modal.
  const phoneInput = document.getElementById("checkoutPhone");
  if (phoneInput && phoneInput.value.trim() !== "") {
    findDeliveryInfo();
  }
}


/* ═══════════════════════════════════════
   SEND WHATSAPP ORDER
═══════════════════════════════════════ */

async function sendWhatsAppOrder(grandTotal){

  if(!selectedDeliveryOption){
    alert("Please select a delivery option.");
    return;
  }

  const customerPhone = normalizePhone(
    document.getElementById("checkoutPhone").value
  );

  // Extract the customer name from the Sheet3 lookup results
  let customerName = "New Customer"; 
  if (latestDeliveryRow) {
    customerName = latestDeliveryRow.name || latestDeliveryRow["Name"] || latestDeliveryRow["name"] || "Valued Customer";
  }

  let itemsTotal = 0;
  let formattedProductsList = "PRODUCTNAME------QTY";

  // Build the WhatsApp message template (Name, Phone, and Addresses removed)
  let msg = "🛒 *NEW ORDER*%0A%0A";

  let fetchedAddress1 = "";
  let fetchedAddress2 = "";

  if (latestDeliveryRow) {
    fetchedAddress1 = latestDeliveryRow.address1 || latestDeliveryRow["Address 1"] || latestDeliveryRow["address 1"] || "";
    fetchedAddress2 = latestDeliveryRow.address2 || latestDeliveryRow["Address 2"] || latestDeliveryRow["address 2"] || "";
  }

  msg    += "━━━━━━━━━━━━━━%0A";
  msg    += "🛍️ *ITEMS:*%0A";

  cart.forEach(item => {
    const product = getProductForItem(item);
    if(!product) return;

    const subtotal = Number(product.price) * item.quantity;
    itemsTotal += subtotal;

    formattedProductsList += `\n${product.product_name}------${item.quantity}`;
    
    msg += "%0A🔹 *" + product.product_name + "*%0A";
    msg += "Qty: " + item.quantity + "%0A";
    msg += "Subtotal: ₦" + fmt(subtotal) + "%0A";
  });

  msg += "%0A━━━━━━━━━━━━━━%0A";

  const mainOption = selectedMainOption === 1
    ? settingsData.main_option_1
    : settingsData.main_option_2;

  msg += "🚛 Main Option: " + mainOption + "%0A";
  msg += "🚚 Delivery: "    + selectedDeliveryOption.title + "%0A";
  msg += "🚚 Delivery Fee: ₦" + fmt(selectedDeliveryOption.fee) + "%0A";
  msg += "%0A💰 *Grand Total: ₦" + fmt(grandTotal) + "*";

  showLoading();

  // Send the payload to your Google Sheet (Personal data is kept here so your database is complete)
  const isSaved = await saveOrderToSheet4({
    timestamp:            new Date().toISOString(),
    name:                 customerName,
    phone:                customerPhone,
    selected_main_option: mainOption,
    selected_sub_option:  selectedDeliveryOption.title,
    address_1:            fetchedAddress1, 
    address_2:            fetchedAddress2,
    products:             formattedProductsList, 
    items_total:          itemsTotal,
    delivery_fee:         selectedDeliveryOption.fee,
    grand_total:          grandTotal
  });

  hideLoading();

  if (isSaved) {
    cart = [];
    updateCartCount();
    localStorage.removeItem("odogwu_cart");

    document.getElementById("checkoutForm").style.display = "none";
    closeCart(); 

    const cleanMsg = msg.replace(/%0A/g, '\n');
    const safeMsg = encodeURIComponent(cleanMsg);
    const waLink = "https://wa.me/" + whatsappNumber + "?text=" + safeMsg;

    window.location.href = waLink;

    document.getElementById("checkoutForm").innerHTML = `
      <div style="padding: 40px; text-align: center;">
        <h2 style="color: #0a8a0a;">Order Saved! ✅</h2>
        <p>If WhatsApp didn't open automatically, click below to send your order.</p>
        <a href="${waLink}" target="_blank" style="display: inline-block; padding: 15px 30px; background: #25D366; color: white; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px;">
          Open WhatsApp
        </a>
      </div>
    `;
    
  } else {
    alert("There was an issue processing your order. Please check your internet connection and try again.");
  }
}


/* ═══════════════════════════════════════
   SAVE ORDER TO SHEET4
═══════════════════════════════════════ */

async function saveOrderToSheet4(orderData){
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "saveOrder",
        order:  orderData
      })
    });
    
    const result = await response.json();
    
    if(!result.success){
      throw new Error(result.error || "Failed to save order");
    }
    
    return true; 
    
  } catch(error){
    console.error("Order save error:", error);
    return false; 
  }
}

/* ═══════════════════════════════════════
   PWA SERVICE WORKER REGISTRATION
═══════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('PWA Service Worker Active:', reg.scope))
      .catch((err) => console.error('PWA Setup Failed:', err));
  });
}

/* ═══════════════════════════════════════
   PWA INSTALLATION LOGIC
═══════════════════════════════════════ */
let deferredPrompt;
const installBtn = document.getElementById('installPwaBtn');

// 1. Catch the install prompt from the browser
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the default mini-infobar from appearing on mobile
  e.preventDefault();
  
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  
  // Update UI to notify the user they can install the PWA
  if (installBtn) {
    installBtn.style.display = 'flex'; // Show the button
  }
});

// 2. Handle the Install Button Click
if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      // Show the native install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      
      // We've used the prompt, so throw it away
      deferredPrompt = null;
      
      // Hide the button regardless of outcome
      installBtn.style.display = 'none';
    }
  });
}

// 3. Listen for successful installation to clean up the UI
window.addEventListener('appinstalled', () => {
  // Hide the button if the app is successfully installed
  if (installBtn) {
    installBtn.style.display = 'none';
  }
  console.log('PWA was successfully installed');
});

/* ═══════════════════════════════════════
   START
═══════════════════════════════════════ */

init();
