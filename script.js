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

/* ═══════════════════════════════════════
   STATE MANAGEMENT
═══════════════════════════════════════ */

let rawProducts = [];
let bannerRows = [];
let productCards = [];
let cart = [];
let whatsappNumber = "";
let selectedCat = "All";
let categories = [];
let expandedCards = new Set();
let selectedDeliveryOption = null;
let selectedMainOption = null;
let selectedSubOption = null;
let selectedDeliveryFee = 0;
let latestDeliveryRow = null;
let settingsData = null;
let activeBannerAdValue = null;
let bannerCurrentIndex = 0;
let bannerTimer = null;
let currentPage = "store";

const BANNER_INTERVAL_MS = 3500;
const DELIVERY_CACHE_KEY = "odogwu_delivery_info";

/* ═══════════════════════════════════════
   UTILITY FUNCTIONS
═══════════════════════════════════════ */

function getCache(key) {
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  try {
    const { timestamp, data } = JSON.parse(cached);
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
  localStorage.setItem(
    key,
    JSON.stringify({
      timestamp: Date.now(),
      data
    })
  );
}

function saveCartToCache() {
  localStorage.setItem("odogwu_cart", JSON.stringify(cart));
}

function showLoading() {
  document.getElementById("loadingOverlay").style.display = "flex";
}

function hideLoading() {
  document.getElementById("loadingOverlay").style.display = "none";
}

function normalizePhone(phone) {
  phone = phone
    .toString()
    .trim()
    .replace(/\s+/g, "")
    .replace(/\-/g, "");

  if (phone.startsWith("+234")) {
    phone = "0" + phone.slice(4);
  } else if (phone.startsWith("234")) {
    phone = "0" + phone.slice(3);
  }

  return phone;
}

function fmt(num) {
  return Math.floor(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* ═══════════════════════════════════════
   PAGE NAVIGATION
═══════════════════════════════════════ */

function switchPage(pageName) {
  currentPage = pageName;

  // Update nav button states
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelector(`[data-page="${pageName}"]`).classList.add("active");

  // Show/hide pages
  document.getElementById("products").style.display =
    pageName === "store" ? "grid" : "none";
  document.getElementById("bannerCarousel").style.display =
    pageName === "store" ? "block" : "none";
  document.getElementById("categoryChipsSection").style.display =
    pageName === "store" ? "flex" : "none";
  document.getElementById("detailsPage").classList.toggle(
    "active",
    pageName === "details"
  );

  // Handle cart page
  if (pageName === "cart") {
    openCart();
  } else {
    closeCart();
  }
}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */

async function init() {
  restoreCartFromCache();
  showLoading();
  await Promise.all([loadSettings(), loadProducts()]);
  loadCachedDeliveryInfo();
  hideLoading();
}

function restoreCartFromCache() {
  try {
    const saved = localStorage.getItem("odogwu_cart");
    if (saved) {
      cart = JSON.parse(saved);
    }
  } catch (e) {
    cart = [];
  }
  updateCartCount();
}

function loadCachedDeliveryInfo() {
  const cached = localStorage.getItem(DELIVERY_CACHE_KEY);
  if (cached) {
    try {
      latestDeliveryRow = JSON.parse(cached);
      displayCachedDeliveryInfo();
    } catch (e) {
      console.error("Failed to load cached delivery info:", e);
    }
  }
}

function displayCachedDeliveryInfo() {
  if (latestDeliveryRow) {
    const cachedSection = document.getElementById("cachedDeliveryInfo");
    document.getElementById("displayName").textContent =
      latestDeliveryRow.name || latestDeliveryRow.Name || "-";
    document.getElementById("displayPhone").textContent =
      latestDeliveryRow.phone || latestDeliveryRow.Phone || "-";
    document.getElementById("displayAddress").textContent =
      latestDeliveryRow.address2 || latestDeliveryRow.Address2 || latestDeliveryRow["Address 2"] || "-";
    cachedSection.style.display = "block";
  }
}

function clearCachedDeliveryInfo() {
  localStorage.removeItem(DELIVERY_CACHE_KEY);
  latestDeliveryRow = null;
  document.getElementById("cachedDeliveryInfo").style.display = "none";
  openDeliveryForm();
}

async function loadSettings() {
  const cacheKey = "odogwu_settings";
  const cached = getCache(cacheKey);

  if (cached) {
    settingsData = cached[0];
    whatsappNumber = settingsData.whatsapp_number;
  } else {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        body: new URLSearchParams({ action: "getSettings" })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      setCache(cacheKey, result.data);
      settingsData = result.data[0];
      whatsappNumber = settingsData.whatsapp_number;
    } catch (error) {
      console.error("Failed to load settings:", error);
      return;
    }
  }

  if (settingsData) {
    if (settingsData.filter_icon) {
      const catIconEl = document.getElementById("categoryIcon");
      if (catIconEl) {
        catIconEl.src = settingsData.filter_icon;
        catIconEl.style.display = "block";
        document.getElementById("catFallback").style.display = "none";
      }
    }
  }
}

async function loadProducts() {
  const cacheKey = "odogwu_products";
  const cached = getCache(cacheKey);

  if (cached) {
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

    if (!result.success) {
      throw new Error(result.error);
    }

    setCache(cacheKey, result.data);
    splitBannersAndProducts(result.data);
    groupProducts();
    buildCategories();
    renderBanners();
    renderProducts();
  } catch (error) {
    console.error(error);
  }
}

/* ═══════════════════════════════════════
   SPLIT BANNERS & PRODUCTS
═══════════════════════════════════════ */

function splitBannersAndProducts(allRows) {
  const potentialBanners = allRows.slice(0, 4);
  const productData = allRows.slice(4);

  bannerRows = potentialBanners.filter((row) => {
    const available = (row.available || "").toUpperCase();
    return available === "Y" || available === "YES";
  });

  rawProducts = productData.filter((row) => {
    const available = (row.available || "").toUpperCase();
    return available === "Y" || available === "YES";
  });
}

function groupProducts() {
  productCards = rawProducts;
}

function buildCategories() {
  const catSet = new Set();
  catSet.add("All");
  productCards.forEach((product) => {
    const cat = product.category || "Uncategorized";
    catSet.add(cat);
  });
  categories = Array.from(catSet);
  renderCategoryChips();
}

/* ═══════════════════════════════════════
   CATEGORY CHIPS RENDERING
═══════════════════════════════════════ */

function renderCategoryChips() {
  const wrapper = document.getElementById("chipsWrapper");
  wrapper.innerHTML = categories
    .map(
      (cat) =>
        `<button class="category-chip ${
          selectedCat === cat ? "active" : ""
        }" onclick="selectCategory('${cat}', event)">
        ${cat}
      </button>`
    )
    .join("");
}

function selectCategory(cat, event) {
  event.stopPropagation();
  selectedCat = cat;
  renderCategoryChips();
  renderProducts();
  document.querySelector(".chips-scroll-container").scrollLeft = 0;
}

function toggleCategoryExpand() {
  const menu = document.getElementById("categoryExpandedMenu");
  const btn = document.getElementById("chipsExpandBtn");
  const isOpen = menu.classList.contains("open");

  if (isOpen) {
    menu.classList.remove("open");
    btn.classList.remove("expanded");
  } else {
    menu.classList.add("open");
    btn.classList.add("expanded");
    renderExpandedMenu();
  }
}

function renderExpandedMenu() {
  const menu = document.getElementById("categoryExpandedMenu");
  menu.innerHTML = categories
    .map(
      (cat) =>
        `<button class="category-menu-item ${
          selectedCat === cat ? "active" : ""
        }" onclick="selectCategory('${cat}', event)">
        ${cat}
      </button>`
    )
    .join("");
}

/* ═══════════════════════════════════════
   PRODUCTS RENDERING
═══════════════════════════════════════ */

function renderProducts() {
  const searchTerm = document
    .getElementById("searchInput")
    .value.toLowerCase();

  let filtered = productCards;

  if (selectedCat !== "All") {
    filtered = filtered.filter((p) => (p.category || "") === selectedCat);
  }

  if (searchTerm) {
    filtered = filtered.filter(
      (p) =>
        (p.product_name || "").toLowerCase().includes(searchTerm) ||
        (p.description || "").toLowerCase().includes(searchTerm)
    );
  }

  const container = document.getElementById("products");
  container.innerHTML = filtered
    .map((product, idx) => {
      const cartItem = cart.find((item) => item.id === product.id);
      const quantity = cartItem ? cartItem.quantity : 0;

      return `
        <div class="card">
          <div class="card-image-wrapper">
            <img src="${product.image_url || ""}" alt="${
        product.product_name
      }" class="card-img" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2214%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'">
            ${
              product.tags
                ? product.tags
                    .split(",")
                    .map((tag) => `<span class="tag-badge">${tag.trim()}</span>`)
                    .join("")
                : ""
            }
            <div class="product-tags"></div>
          </div>
          <div class="card-content">
            <div>
              <div class="product-name">${product.product_name}</div>
              <div class="description">${product.description || ""}</div>
              <div class="price">₦${fmt(product.price)}</div>
            </div>
            <div class="quantity-box">
              <button class="qty-btn" onclick="decrementProduct('${product.id}')">−</button>
              <span class="qty-display">${quantity}</span>
              <button class="qty-btn" onclick="incrementProduct('${product.id}')">+</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function incrementProduct(productId) {
  const product = productCards.find((p) => p.id === productId);
  if (!product) return;

  const existingItem = cart.find((item) => item.id === productId);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      id: productId,
      quantity: 1
    });
  }

  saveCartToCache();
  updateCartCount();
  renderProducts();
  renderCartItems();
}

function decrementProduct(productId) {
  const itemIndex = cart.findIndex((item) => item.id === productId);

  if (itemIndex > -1) {
    if (cart[itemIndex].quantity > 1) {
      cart[itemIndex].quantity -= 1;
    } else {
      cart.splice(itemIndex, 1);
    }
  }

  saveCartToCache();
  updateCartCount();
  renderProducts();
  renderCartItems();
}

function updateCartCount() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById("navCartBadge").textContent = count;
  document.getElementById("cartCount").textContent = count;
}

function getProductForItem(item) {
  return productCards.find((p) => p.id === item.id);
}

/* ═══════════════════════════════════════
   BANNER CAROUSEL
═══════════════════════════════════════ */

function renderBanners() {
  if (bannerRows.length === 0) {
    document.getElementById("bannerCarousel").innerHTML = "";
    return;
  }

  const html = `
    <div class="banner-track-outer">
      <div class="banner-track" id="bannerTrack">
        ${bannerRows
          .map(
            (banner) =>
              `<div class="banner-slide">
            <img src="${banner.image_url || ""}" alt="Banner" class="banner-img" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22180%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22400%22 height=%22180%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2216%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3EBanner Image%3C/text%3E%3C/svg%3E'">
          </div>`
          )
          .join("")}
      </div>
      <div class="banner-dots" id="bannerDots">
        ${bannerRows.map((_, i) => `<div class="banner-dot ${i === 0 ? "active" : ""}" onclick="goToBannerSlide(${i})"></div>`).join("")}
      </div>
    </div>
  `;

  document.getElementById("bannerCarousel").innerHTML = html;
  startBannerAutoScroll();
}

function goToBannerSlide(index) {
  bannerCurrentIndex = index;
  updateBannerPosition();
  resetBannerTimer();
}

function updateBannerPosition() {
  const track = document.getElementById("bannerTrack");
  if (track) {
    track.style.transform = `translateX(-${bannerCurrentIndex * 100}%)`;
  }

  document.querySelectorAll(".banner-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === bannerCurrentIndex);
  });
}

function startBannerAutoScroll() {
  resetBannerTimer();
}

function resetBannerTimer() {
  clearInterval(bannerTimer);
  bannerTimer = setInterval(() => {
    if (bannerRows.length > 0) {
      bannerCurrentIndex = (bannerCurrentIndex + 1) % bannerRows.length;
      updateBannerPosition();
    }
  }, BANNER_INTERVAL_MS);
}

/* ═══════════════════════════════════════
   CART SLIDE-UP MODAL
═══════════════════════════════════════ */

function openCart() {
  document.getElementById("cartSlideModal").classList.add("active");
  document.getElementById("cartSlideOverlay").classList.add("active");
  document.body.style.overflow = "hidden";
  renderCartItems();
}

function closeCart() {
  document.getElementById("cartSlideModal").classList.remove("active");
  document.getElementById("cartSlideOverlay").classList.remove("active");
  document.body.style.overflow = "";
  document.getElementById("checkoutForm").classList.remove("active");

  // Reset to store page
  if (currentPage === "cart") {
    switchPage("store");
  }
}

function renderCartItems() {
  const container = document.getElementById("cartItems");
  const emptyMsg = document.getElementById("emptyCartMessage");
  const checkoutBtn = document.getElementById("checkoutBtn");

  if (cart.length === 0) {
    container.innerHTML = "";
    emptyMsg.style.display = "block";
    checkoutBtn.disabled = true;
    document.getElementById("subtotalDisplay").textContent = "₦0";
    return;
  }

  emptyMsg.style.display = "none";
  checkoutBtn.disabled = false;

  let subtotal = 0;

  const itemsHtml = cart
    .map((item) => {
      const product = getProductForItem(item);
      if (!product) return "";

      const itemTotal = Number(product.price) * item.quantity;
      subtotal += itemTotal;

      return `
        <div class="cart-item-row">
          <img src="${product.image_url || ""}" alt="${product.product_name}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22%3E%3Crect fill=%22%23f0f0f0%22 width=%2260%22 height=%2260%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2210%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3E-
%3C/text%3E%3C/svg%3E'">
          <div class="cart-item-details">
            <div class="cart-item-name">${product.product_name}</div>
            <div class="cart-item-price">₦${fmt(itemTotal)}</div>
            <div class="cart-item-controls">
              <button class="cart-qty-btn" onclick="decrementProduct('${product.id}')">−</button>
              <span class="cart-qty-display">${item.quantity}</span>
              <button class="cart-qty-btn" onclick="incrementProduct('${product.id}')">+</button>
              <button class="cart-remove-btn" onclick="removeFromCart('${product.id}')">🗑️</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = itemsHtml;
  document.getElementById("subtotalDisplay").textContent = `₦${fmt(subtotal)}`;
}

function removeFromCart(productId) {
  const index = cart.findIndex((item) => item.id === productId);
  if (index > -1) {
    cart.splice(index, 1);
    saveCartToCache();
    updateCartCount();
    renderCartItems();
    renderProducts();
  }
}

function openCheckout() {
  if (cart.length === 0) {
    alert("Your cart is empty");
    return;
  }

  document.getElementById("cartSlideOverlay").style.display = "none";
  document.getElementById("cartSlideModal").style.borderRadius =
    "0";
  document.getElementById("checkoutForm").classList.add("active");
}

function backToCart() {
  document.getElementById("checkoutForm").classList.remove("active");
  document.getElementById("cartSlideOverlay").style.display = "block";
  document.getElementById("cartSlideModal").style.borderRadius =
    "20px 20px 0 0";
  document.getElementById("deliveryUI").innerHTML = "";
  document.getElementById("deliveryOptions").innerHTML = "";
  document.getElementById("checkoutPhone").value = "";
}

/* ═══════════════════════════════════════
   DELIVERY INFO - FIND & VERIFY
═══════════════════════════════════════ */

async function findDeliveryInfo() {
  const phoneInput = document.getElementById("checkoutPhone");
  const phone = normalizePhone(phoneInput.value);

  if (!phone) {
    alert("Please enter a phone number");
    return;
  }

  showLoading();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "getDeliveryInfo",
        phone: phone
      })
    });

    const result = await response.json();
    hideLoading();

    if (result.success && result.data && result.data.length > 0) {
      latestDeliveryRow = result.data[0];
      localStorage.setItem(
        DELIVERY_CACHE_KEY,
        JSON.stringify(latestDeliveryRow)
      );

      document.getElementById("deliveryUI").innerHTML = `
        <div style="background: #f0f8ff; padding: 12px 0; border-radius: 10px; margin-bottom: 12px; text-align: center;">
          <p style="font-weight: 700; color: #0a8a0a; margin: 0;">✅ Information verified!</p>
          <p style="font-size: 12px; color: #666; margin: 4px 0 0 0;">Welcome back, ${
            latestDeliveryRow.name || "Valued Customer"
          }</p>
        </div>
      `;

      renderDeliveryOptions();
    } else {
      document.getElementById("deliveryUI").innerHTML = `
        <div style="background: #fff5f5; padding: 12px; border-radius: 10px; margin-bottom: 12px; border-left: 4px solid #FF0004;">
          <p style="font-weight: 700; color: #FF0004; margin: 0;">New Customer</p>
          <p style="font-size: 12px; color: #666; margin: 4px 0 0 0;">Proceed to select your delivery option</p>
        </div>
      `;

      latestDeliveryRow = null;
      renderDeliveryOptions();
    }
  } catch (error) {
    hideLoading();
    console.error("Delivery info error:", error);
    alert("Failed to verify phone number. Please try again.");
  }
}

function renderDeliveryOptions() {
  const mainOptions = selectedMainOption === 1
    ? DELIVERY_COLUMNS.main1
    : DELIVERY_COLUMNS.main2;

  if (!selectedMainOption) {
    selectedMainOption = 1;
  }

  const mainOptionsHtml = `
    <div style="margin-bottom: 14px;">
      <p style="font-weight: 700; font-size: 13px; margin-bottom: 8px; color: #333;">Select Delivery Main Option:</p>
      <div style="display: flex; gap: 8px;">
        <button class="main-option ${
          selectedMainOption === 1 ? "active" : ""
        }" onclick="setMainOption(1)" style="flex: 1; padding: 10px; background: ${
    selectedMainOption === 1 ? "#FF0004" : "white"
  }; color: ${selectedMainOption === 1 ? "white" : "#333"}; border: 1.5px solid #ddd; border-radius: 10px; font-weight: 700; cursor: pointer;">
          ${settingsData?.main_option_1 || "Option 1"}
        </button>
        <button class="main-option ${
          selectedMainOption === 2 ? "active" : ""
        }" onclick="setMainOption(2)" style="flex: 1; padding: 10px; background: ${
    selectedMainOption === 2 ? "#FF0004" : "white"
  }; color: ${selectedMainOption === 2 ? "white" : "#333"}; border: 1.5px solid #ddd; border-radius: 10px; font-weight: 700; cursor: pointer;">
          ${settingsData?.main_option_2 || "Option 2"}
        </button>
      </div>
    </div>
  `;

  const subOptionsHtml = mainOptions
    .map(
      (option) =>
        `
    <div class="delivery-option ${
      selectedSubOption === option ? "active" : ""
    }" onclick="selectDeliveryOption('${option}')">
      <input type="radio" name="delivery" value="${option}" ${
          selectedSubOption === option ? "checked" : ""
        } style="cursor: pointer; margin-right: 8px;">
      <label style="cursor: pointer; font-weight: 700; font-size: 13px;">
        ${option}
      </label>
      <div class="delivery-desc">${
        DELIVERY_DESCRIPTIONS[option] || ""
      }</div>
    </div>
  `
    )
    .join("");

  const grandTotalHtml = calculateGrandTotal();

  const checkoutHtml = `
    ${mainOptionsHtml}
    ${subOptionsHtml}
    ${grandTotalHtml}
  `;

  document.getElementById("deliveryOptions").innerHTML = checkoutHtml;
}

function setMainOption(option) {
  selectedMainOption = option;
  selectedSubOption = null;
  renderDeliveryOptions();
}

function selectDeliveryOption(option) {
  selectedSubOption = option;

  const selectedOption = {
    main1: DELIVERY_COLUMNS.main1,
    main2: DELIVERY_COLUMNS.main2
  };

  const optionsForMain = selectedMainOption === 1
    ? DELIVERY_COLUMNS.main1
    : DELIVERY_COLUMNS.main2;

  const index = optionsForMain.indexOf(option);

  const mainOption = selectedMainOption === 1
    ? settingsData.main_option_1
    : settingsData.main_option_2;

  // Fee logic based on option
  if (option === "Pick-up") {
    selectedDeliveryFee = 0;
  } else if (option.includes("Home")) {
    selectedDeliveryFee = settingsData[`home_delivery_fee_${selectedMainOption}`] ||
      settingsData.home_delivery_fee ||
      2000;
  } else {
    selectedDeliveryFee = settingsData[`nearby_delivery_fee_${selectedMainOption}`] ||
      settingsData.nearby_delivery_fee ||
      1500;
  }

  selectedDeliveryOption = {
    title: option,
    fee: selectedDeliveryFee
  };

  renderDeliveryOptions();
}

function calculateGrandTotal() {
  if (!selectedDeliveryOption) {
    return `
      <div style="text-align: center; color: #999; padding: 20px;">
        <p>Select a delivery option to proceed</p>
      </div>
    `;
  }

  let itemsTotal = 0;
  cart.forEach((item) => {
    const product = getProductForItem(item);
    if (product) {
      itemsTotal += Number(product.price) * item.quantity;
    }
  });

  const fee = selectedDeliveryFee;
  const grandTotal = itemsTotal + fee;

  return `
    <div style="margin-top: 16px; padding: 14px; background: #f9f9f9; border-radius: 10px; border-left: 4px solid #FFBE1A;">
      <div style="margin-bottom: 8px; font-size: 13px; color: #666;"><b>Products:</b> ₦${fmt(
        itemsTotal
      )}</div>
      <div style="margin-bottom: 8px; font-size: 13px; color: #666;"><b>Delivery:</b> ₦${fmt(
        fee
      )}</div>
      <div style="font-size: 18px; font-weight: 900; color: #0a8a0a; margin-bottom: 12px;">
        Grand Total: ₦${fmt(grandTotal)}
      </div>
      <button class="done-btn" onclick="sendWhatsAppOrder(${grandTotal})" style="margin: 0;">
        Done ✅
      </button>
    </div>
  `;
}

/* ═══════════════════════════════════════
   DELIVERY FORM MODAL
═══════════════════════════════════════ */

function openDeliveryForm() {
  let formModal = document.getElementById("pwaFormModal");

  if (!formModal) {
    formModal = document.createElement("div");
    formModal.id = "pwaFormModal";
    formModal.style.cssText =
      "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); z-index:9999; display:flex; align-items:center; justify-content:center; padding:12px; box-sizing:border-box;";
    document.body.appendChild(formModal);
  }

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

  const phoneInput = document.getElementById("checkoutPhone");
  if (phoneInput && phoneInput.value.trim() !== "") {
    setTimeout(() => {
      findDeliveryInfo();
    }, 500);
  }
}

/* ═══════════════════════════════════════
   SEND WHATSAPP ORDER
═══════════════════════════════════════ */

async function sendWhatsAppOrder(grandTotal) {
  if (!selectedDeliveryOption) {
    alert("Please select a delivery option.");
    return;
  }

  const customerPhone = normalizePhone(
    document.getElementById("checkoutPhone").value
  );

  let customerName = "New Customer";
  if (latestDeliveryRow) {
    customerName =
      latestDeliveryRow.name ||
      latestDeliveryRow.Name ||
      "Valued Customer";
  }

  let itemsTotal = 0;
  let formattedProductsList = "PRODUCTNAME------QTY";

  let msg = "🛒 *NEW ORDER*%0A%0A";

  let fetchedAddress1 = "";
  let fetchedAddress2 = "";

  if (latestDeliveryRow) {
    fetchedAddress1 =
      latestDeliveryRow.address1 ||
      latestDeliveryRow.Address1 ||
      latestDeliveryRow["Address 1"] ||
      "";
    fetchedAddress2 =
      latestDeliveryRow.address2 ||
      latestDeliveryRow.Address2 ||
      latestDeliveryRow["Address 2"] ||
      "";
  }

  msg += "━━━━━━━━━━━━━━%0A";
  msg += "🛍️ *ITEMS:*%0A";

  cart.forEach((item) => {
    const product = getProductForItem(item);
    if (!product) return;

    const subtotal = Number(product.price) * item.quantity;
    itemsTotal += subtotal;

    formattedProductsList += `\n${product.product_name}------${item.quantity}`;

    msg += "%0A🔹 *" + product.product_name + "*%0A";
    msg += "Qty: " + item.quantity + "%0A";
    msg += "Subtotal: ₦" + fmt(subtotal) + "%0A";
  });

  msg += "%0A━━━━━━━━━━━━━━%0A";

  const mainOption =
    selectedMainOption === 1
      ? settingsData.main_option_1
      : settingsData.main_option_2;

  msg += "🚛 Main Option: " + mainOption + "%0A";
  msg += "🚚 Delivery: " + selectedDeliveryOption.title + "%0A";
  msg += "🚚 Delivery Fee: ₦" + fmt(selectedDeliveryOption.fee) + "%0A";
  msg += "%0A💰 *Grand Total: ₦" + fmt(grandTotal) + "*";

  showLoading();

  const isSaved = await saveOrderToSheet4({
    timestamp: new Date().toISOString(),
    name: customerName,
    phone: customerPhone,
    selected_main_option: mainOption,
    selected_sub_option: selectedDeliveryOption.title,
    address_1: fetchedAddress1,
    address_2: fetchedAddress2,
    products: formattedProductsList,
    items_total: itemsTotal,
    delivery_fee: selectedDeliveryOption.fee,
    grand_total: grandTotal
  });

  hideLoading();

  if (isSaved) {
    cart = [];
    updateCartCount();
    localStorage.removeItem("odogwu_cart");

    closeCart();

    const cleanMsg = msg.replace(/%0A/g, "\n");
    const safeMsg = encodeURIComponent(cleanMsg);
    const waLink = "https://wa.me/" + whatsappNumber + "?text=" + safeMsg;

    window.location.href = waLink;
  } else {
    alert(
      "There was an issue processing your order. Please check your internet connection and try again."
    );
  }
}

async function saveOrderToSheet4(orderData) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "saveOrder",
        order: orderData
      })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Failed to save order");
    }

    return true;
  } catch (error) {
    console.error("Order save error:", error);
    return false;
  }
}

/* ═══════════════════════════════════════
   PWA FUNCTIONALITY
═══════════════════════════════════════ */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("PWA Service Worker Active:", reg.scope))
      .catch((err) => console.error("PWA Setup Failed:", err));
  });
}

let deferredPrompt;
const installBtn = document.getElementById("installPwaBtn");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) {
    installBtn.style.display = "flex";
  }
});

if (installBtn) {
  installBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      deferredPrompt = null;
      installBtn.style.display = "none";
    }
  });
}

window.addEventListener("appinstalled", () => {
  if (installBtn) {
    installBtn.style.display = "none";
  }
  console.log("PWA was successfully installed");
});

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */

init();
