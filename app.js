
/* =========================================
   GERMANY KITCHEN PLANNER
   Mobile-first JavaScript
   IndexedDB Local Storage
========================================= */

const DB_NAME = "GermanyKitchenPlanner";
const DB_VERSION = 1;

let db;

let currentFilter = "all";
let currentDashboardCategory = "all";
let currentPlannerDate = new Date();

let allIngredients = [];
let allDishes = [];


// =========================================
// SUPABASE CONFIGURATION
// =========================================

const SUPABASE_URL = "https://qfachmjtwovehnfdcliw.supabase.co";

// Paste your Supabase Publishable Key here.
// Never put your Secret / Service Role Key here.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Ny2x2epSym5p1TJiArVU8g_LJ4Pyf-5";


const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let currentProfile = null;


// =========================================
// AUTHENTICATION SCREEN MANAGEMENT
// =========================================

function showAuthScreen(screenId) {

  document.getElementById("auth-container").hidden = false;
  document.getElementById("app-container").hidden = true;

  document.querySelectorAll(".auth-screen").forEach(screen => {
    screen.hidden = true;
  });

  document.getElementById(screenId).hidden = false;
}


function showKitchenPlanner(profile) {

  currentProfile = profile;

  localStorage.setItem(
    "germanyKitchenProfile",
    JSON.stringify(profile)
  );

  document.getElementById("current-profile-name").textContent =
    profile.display_name;

  document.getElementById("auth-container").hidden = true;
  document.getElementById("app-container").hidden = false;

  initializeKitchenPlanner();
}


// =========================================
// ENSURE SUPABASE ANONYMOUS SESSION
// =========================================

async function ensureSupabaseSession() {

  const { data: sessionData, error: sessionError } =
    await supabaseClient.auth.getSession();

  if (sessionError) throw sessionError;

  let session = sessionData.session;

  if (!session) {

    const { data, error } =
      await supabaseClient.auth.signInAnonymously();

    if (error) throw error;

    session = data.session;
  }

  if (!session) {
    throw new Error("Unable to create Supabase session.");
  }

  return session;
}


// =========================================
// CHECK HOUSEHOLD ACCESS
// =========================================

async function checkHouseholdAccess() {

  return sessionStorage.getItem("household_access") === "true";

}


// =========================================
// HOUSEHOLD PASSWORD LOGIN
// =========================================

async function householdLogin(password) {

  const { data, error } = await supabaseClient.rpc(
    "check_household_password",
    {
      p_password: password
    }
  );

  if (error) {
    console.error("Password verification error:", error);
    throw new Error("Unable to verify household password.");
  }

  if (data !== true) {
    throw new Error("Incorrect household password.");
  }

  // Remember access for this browser tab.
  sessionStorage.setItem("household_access", "true");

  return true;
}
// =========================================
// LOAD HOUSEHOLD PROFILES
// =========================================

async function loadHouseholdProfiles() {

  const container = document.getElementById("profile-list");
  const errorElement = document.getElementById("profile-error");

  errorElement.textContent = "";

  container.innerHTML = `
    <div class="empty-state">
      <p>Loading household profiles...</p>
    </div>
  `;

  const { data, error } = await supabaseClient
    .from("household_users")
    .select("id, display_name")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  container.innerHTML = "";

  if (!data || data.length === 0) {

    container.innerHTML = `
      <div class="empty-state">
        <div style="font-size:30px">👤</div>
        <p>No profiles created yet.</p>
        <p>Create your first household profile below.</p>
      </div>
    `;

    showAuthScreen("profile-screen");
    return;
  }

  data.forEach(profile => {

    const button = document.createElement("button");

    button.type = "button";
    button.className = "profile-option";

    button.dataset.profileId = profile.id;
    button.dataset.profileName = profile.display_name;

    button.innerHTML = `
      <span class="profile-option-icon">👤</span>

      <span class="profile-option-name">
        ${escapeHTML(profile.display_name)}
      </span>

      <span class="profile-option-arrow">→</span>
    `;

    container.appendChild(button);

  });

  // Restore the previously selected profile on this device.
  const savedProfileText = localStorage.getItem(
    "germanyKitchenProfile"
  );

  if (savedProfileText) {

    try {

      const savedProfile = JSON.parse(savedProfileText);

      const matchingProfile = data.find(
        profile => profile.id === savedProfile.id
      );

      if (matchingProfile) {
        showKitchenPlanner(matchingProfile);
        return;
      }

    } catch (error) {

      console.warn("Saved profile could not be restored.", error);

    }

  }

  showAuthScreen("profile-screen");
}


// =========================================
// CREATE NEW HOUSEHOLD PROFILE
// =========================================

async function createHouseholdProfile(displayName) {

  const { data: userData, error: userError } =
    await supabaseClient.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!userData.user) {
    throw new Error("Please log in again.");
  }

  const { data, error } = await supabaseClient
    .from("household_users")
    .insert({
      display_name: displayName,
      created_by: userData.user.id
    })
    .select("id, display_name")
    .single();

  if (error) {
    throw error;
  }

  return data;
}


// =========================================
// PROFILE SCREEN EVENTS
// =========================================

function setupAuthenticationEvents() {

  // Household password form
  document.getElementById("household-login-form")
    .addEventListener("submit", async event => {

      event.preventDefault();

      const passwordInput =
        document.getElementById("household-password");

      const errorElement =
        document.getElementById("auth-error");

      const loginButton =
        document.getElementById("login-btn");

      const password = passwordInput.value;

      errorElement.textContent = "";

      if (!password.trim()) {
        errorElement.textContent = "Please enter your household password.";
        return;
      }

      loginButton.disabled = true;
      loginButton.textContent = "Checking...";

      try {

        await householdLogin(password);

        passwordInput.value = "";

        await loadHouseholdProfiles();

      } catch (error) {

        console.error("Household login error:", error);

        errorElement.textContent =
          "Login failed. Check your password and try again.";

      } finally {

        loginButton.disabled = false;
        loginButton.textContent = "Continue";

      }

    });


  // Select an existing profile
  document.getElementById("profile-list")
    .addEventListener("click", event => {

      const button = event.target.closest(".profile-option");

      if (!button) return;

      const profile = {
        id: button.dataset.profileId,
        display_name: button.dataset.profileName
      };

      showKitchenPlanner(profile);

    });


  // Show create profile screen
  document.getElementById("show-create-profile")
    .addEventListener("click", () => {

      document.getElementById("create-profile-error").textContent = "";

      document.getElementById("profile-name").value = "";

      showAuthScreen("create-profile-screen");

    });


  // Back to profile selection
  document.getElementById("back-to-profiles")
    .addEventListener("click", () => {

      showAuthScreen("profile-screen");

    });


  // Create profile form
  document.getElementById("profile-form")
    .addEventListener("submit", async event => {

      event.preventDefault();

      const nameInput = document.getElementById("profile-name");

      const errorElement =
        document.getElementById("create-profile-error");

      const createButton =
        document.getElementById("create-profile-btn");

      const displayName = nameInput.value.trim();

      errorElement.textContent = "";

      if (!displayName) {
        errorElement.textContent = "Please enter your name.";
        return;
      }

      createButton.disabled = true;
      createButton.textContent = "Creating...";

      try {

        const profile = await createHouseholdProfile(displayName);

        showToast("Profile created successfully!");

        showKitchenPlanner(profile);

      } catch (error) {

        console.error("Profile creation error:", error);

        errorElement.textContent =
          "Unable to create profile. Please try again.";

      } finally {

        createButton.disabled = false;
        createButton.textContent = "Create Profile";

      }

    });


  // Switch profile
  document.getElementById("switch-profile-btn")
    .addEventListener("click", async () => {

      try {

        await loadHouseholdProfiles();

      } catch (error) {

        console.error(error);

        showToast("Unable to load profiles.");

      }

    });

}


// =========================================
// START AUTHENTICATION
// =========================================

async function initializeAuthentication() {

  setupAuthenticationEvents();

  showAuthScreen("auth-screen");

  try {

    await ensureSupabaseSession();

    const hasAccess = await checkHouseholdAccess();

    if (hasAccess) {

      await loadHouseholdProfiles();

    } else {

      showAuthScreen("auth-screen");

    }

  } catch (error) {

    console.error("Authentication initialization error:", error);

    document.getElementById("auth-error").textContent =
      "Unable to connect. Please refresh and try again.";

  }

}



// =========================================
// 1. DATABASE - SUPABASE CLOUD STORAGE
// =========================================

// Your existing Supabase tables are used directly.
// No new tables are required.

const TABLES = {
  ingredients: "ingredients",
  dishes: "dishes",
  planner: "planner",
  shopping: "shopping"
};


// Initialize Supabase database connection
async function openDatabase() {

  const { error } = await supabaseClient
    .from("ingredients")
    .select("id")
    .limit(1);

  if (error) {
    throw error;
  }

  console.log("Supabase cloud database connected.");

  return true;
}


// Save or update a record in Supabase
async function saveRecord(storeName, record) {

  const table = TABLES[storeName];

  if (!table) {
    throw new Error("Unknown database table: " + storeName);
  }

  const { data, error } = await supabaseClient
    .from(table)
    .upsert(record, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error("Supabase save error:", error);
    throw error;
  }

  return data;
}


// Get all records from Supabase
async function getAllRecords(storeName) {

  const table = TABLES[storeName];

  if (!table) {
    throw new Error("Unknown database table: " + storeName);
  }

  const { data, error } = await supabaseClient
    .from(table)
    .select("*");

  if (error) {
    console.error("Supabase read error:", error);
    throw error;
  }

  return data || [];
}


// Delete a record from Supabase
async function deleteRecord(storeName, id) {

  const table = TABLES[storeName];

  if (!table) {
    throw new Error("Unknown database table: " + storeName);
  }

  const { error } = await supabaseClient
    .from(table)
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Supabase delete error:", error);
    throw error;
  }
}


// Clear all records from a Supabase table
async function clearStore(storeName) {

  const table = TABLES[storeName];

  if (!table) {
    throw new Error("Unknown database table: " + storeName);
  }

  const { error } = await supabaseClient
    .from(table)
    .delete()
    .not("id", "is", null);

  if (error) {
    console.error("Supabase clear error:", error);
    throw error;
  }
}



// =========================================
// 2. UTILITIES
// =========================================

function generateId() {
  return Date.now().toString(36) +
    Math.random().toString(36).substring(2, 9);
}


function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}


function formatQuantity(quantity) {
  const number = Number(quantity);

  if (!Number.isFinite(number)) return "0";

  return Number.isInteger(number)
    ? String(number)
    : String(Number(number.toFixed(2)));
}


function todayString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function showToast(message) {
  const toast = document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}


function emptyState(message, icon = "🍽️") {
  return `
    <div class="empty-state">
      <div style="font-size:32px">${icon}</div>
      <p>${escapeHTML(message)}</p>
    </div>
  `;
}


function getIngredientById(id) {
  return allIngredients.find(item => item.id === id);
}


function getDishById(id) {
  return allDishes.find(item => item.id === id);
}


// =========================================
// 3. UNIT CONVERSION
// =========================================

const unitGroups = {
  weight: {
    g: 1,
    kg: 1000
  },

  volume: {
    ml: 1,
    l: 1000,
    tsp: 5,
    tbsp: 15
  }
};


function convertQuantity(quantity, fromUnit, toUnit) {
  const amount = Number(quantity);

  if (fromUnit === toUnit) return amount;

  for (const group of Object.values(unitGroups)) {
    if (group[fromUnit] && group[toUnit]) {
      return amount * group[fromUnit] / group[toUnit];
    }
  }

  return null;
}


function getAvailableQuantity(ingredient, requiredUnit) {
  if (!ingredient) return 0;

  if (ingredient.unit === "available") {
    return Number(ingredient.quantity) > 0 ? 1 : 0;
  }

  if (requiredUnit === "available") {
    return Number(ingredient.quantity) > 0 ? 1 : 0;
  }

  const converted = convertQuantity(
    ingredient.quantity,
    ingredient.unit,
    requiredUnit
  );

  return converted === null ? 0 : converted;
}


// =========================================
// 4. INGREDIENT AVAILABILITY
// =========================================

function getRecipeIngredientStatus(recipeItem) {
  const ingredient = getIngredientById(recipeItem.ingredientId);

  if (!ingredient) {
    return {
      available: false,
      missing: Number(recipeItem.quantity) || 0,
      ingredient: null
    };
  }

  const required = Number(recipeItem.quantity) || 0;

  if (recipeItem.unit === "available" ||
      ingredient.unit === "available") {

    const isAvailable = Number(ingredient.quantity) > 0;

    return {
      available: isAvailable,
      missing: isAvailable ? 0 : 1,
      ingredient
    };
  }

  const available = getAvailableQuantity(
    ingredient,
    recipeItem.unit
  );

  return {
    available: available >= required,
    missing: Math.max(0, required - available),
    ingredient
  };
}


function getDishStatus(dish) {
  const ingredients = dish.ingredients || [];

  if (ingredients.length === 0) {
    return {
      status: "missing",
      ready: 0,
      total: 0,
      missing: 0
    };
  }

  let ready = 0;
  let missing = 0;

  ingredients.forEach(item => {
    const result = getRecipeIngredientStatus(item);

    if (result.available) {
      ready++;
    } else {
      missing++;
    }
  });

  let status = "missing";

  if (ready === ingredients.length) {
    status = "ready";
  } else if (ready > 0) {
    status = "partial";
  }

  return {
    status,
    ready,
    total: ingredients.length,
    missing
  };
}


function statusLabel(status) {
  if (status === "ready") return "Ready";
  if (status === "partial") return "Partial";
  return "Missing";
}


// =========================================
// 5. NAVIGATION
// =========================================

function navigateTo(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.remove("active");
  });

  const page = document.getElementById(pageId);

  if (!page) return;

  page.classList.add("active");

  const navButton = document.querySelector(
    `.nav-item[data-page="${pageId}"]`
  );

  if (navButton) {
    navButton.classList.add("active");
  }

  const titles = {
    dashboard: "Germany Kitchen",
    inventory: "My Ingredients",
    dishes: "My Dishes",
    shopping: "Shopping List",
    planner: "Meal Planner",
    references: "Recipe References"
  };

  const title = document.getElementById("page-title");

  if (title) {
    title.textContent = titles[pageId] || "Germany Kitchen";
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (pageId === "dashboard") renderDashboard();
  if (pageId === "inventory") renderInventory();
  if (pageId === "dishes") renderAllDishes();
  if (pageId === "shopping") renderShoppingSelection();
  if (pageId === "planner") renderPlanner();
  if (pageId === "references") renderReferences();
}


document.addEventListener("click", event => {
  const pageButton = event.target.closest("[data-page]");

  if (pageButton) {
    navigateTo(pageButton.dataset.page);
  }
});


// =========================================
// 6. MODALS
// =========================================

function openModal(id) {
  const modal = document.getElementById(id);

  if (modal) {
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }
}


function closeModal(modal) {
  modal.classList.remove("active");

  if (!document.querySelector(".modal.active")) {
    document.body.style.overflow = "";
  }
}


document.addEventListener("click", event => {
  const closeButton = event.target.closest("[data-close]");

  if (closeButton) {
    const modal = closeButton.closest(".modal");

    if (modal) closeModal(modal);
  }
});


document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    document.querySelectorAll(".modal.active").forEach(modal => {
      closeModal(modal);
    });
  }
});


// =========================================
// 7. INGREDIENT INVENTORY
// =========================================

async function refreshIngredients() {
  allIngredients = await getAllRecords("ingredients");

  renderInventory();
  renderDashboard();
  renderAllDishes();
}


function getExpiryStatus(expiry) {
  if (!expiry) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiryDate = new Date(expiry + "T00:00:00");
  const difference = Math.ceil(
    (expiryDate - today) / (1000 * 60 * 60 * 24)
  );

  if (difference < 0) return "Expired";
  if (difference <= 7) return "Expiring soon";

  return "Good";
}


function renderInventory() {
  const container = document.getElementById("ingredient-table-body");

  if (!container) return;

  const search = (
    document.getElementById("ingredient-search")?.value || ""
  ).toLowerCase();

  const filtered = allIngredients.filter(item =>
    item.name.toLowerCase().includes(search)
  );

  const lowStock = allIngredients.filter(item =>
    Number(item.quantity) <= 0
  ).length;

  const expiring = allIngredients.filter(item => {
    const status = getExpiryStatus(item.expiry);
    return status === "Expired" || status === "Expiring soon";
  }).length;

  document.getElementById("total-ingredients").textContent =
    allIngredients.length;

  document.getElementById("low-stock-count").textContent =
    lowStock;

  document.getElementById("expiring-count").textContent =
    expiring;

  if (!filtered.length) {
    container.innerHTML = emptyState(
      allIngredients.length
        ? "No matching ingredients found."
        : "Your ingredient list is empty. Add your first ingredient.",
      "🥕"
    );
    return;
  }

  container.innerHTML = filtered.map(item => {
    const expiryStatus = getExpiryStatus(item.expiry);

    const stockText = item.unit === "available"
      ? (Number(item.quantity) > 0 ? "Available" : "Not available")
      : `${formatQuantity(item.quantity)} ${escapeHTML(item.unit)}`;

    let expiryHTML = "";

    if (expiryStatus) {
      const expiryClass = expiryStatus === "Good"
        ? "good"
        : expiryStatus === "Expired"
          ? "expired"
          : "expiring";

      expiryHTML = `
        <span class="expiry-label ${expiryClass}">
          ${expiryStatus}
        </span>
      `;
    }

    return `
      <div class="ingredient-card">

        <div class="ingredient-info">
          <h3>${escapeHTML(item.name)}</h3>
          <p>Quantity: ${stockText}</p>
          ${item.expiry ? `<p>Expiry: ${escapeHTML(item.expiry)}</p>` : ""}
          ${expiryHTML}
        </div>

        <div class="ingredient-actions">

          <button
            class="edit-btn"
            data-action="edit-ingredient"
            data-id="${escapeHTML(item.id)}"
            aria-label="Edit ${escapeHTML(item.name)}"
            title="Edit"
          >✎</button>

          <button
            class="delete-btn"
            data-action="delete-ingredient"
            data-id="${escapeHTML(item.id)}"
            aria-label="Delete ${escapeHTML(item.name)}"
            title="Delete"
          >🗑</button>

        </div>

      </div>
    `;
  }).join("");
}


function openIngredientForm(item = null) {
  document.getElementById("ingredient-form").reset();

  document.getElementById("ingredient-id").value =
    item?.id || "";

  document.getElementById("ingredient-name").value =
    item?.name || "";

  document.getElementById("ingredient-quantity").value =
    item?.quantity ?? "";

  document.getElementById("ingredient-unit").value =
    item?.unit || "pcs";

  document.getElementById("ingredient-expiry").value =
    item?.expiry || "";

  document.getElementById("ingredient-modal-title").textContent =
    item ? "Edit Ingredient" : "Add Ingredient";

  openModal("ingredient-modal");
}


document.getElementById("add-ingredient-btn")
  ?.addEventListener("click", () => {
    openIngredientForm();
  });


document.getElementById("ingredient-form")
  ?.addEventListener("submit", async event => {

    event.preventDefault();

    const id = document.getElementById("ingredient-id").value;

    const name = document.getElementById("ingredient-name")
      .value.trim();

    const quantity = Number(
      document.getElementById("ingredient-quantity").value
    );

    const unit = document.getElementById("ingredient-unit").value;

    const expiry = document.getElementById("ingredient-expiry").value;

    if (!name || quantity < 0 || !Number.isFinite(quantity)) {
      showToast("Please enter valid ingredient details.");
      return;
    }

    const ingredient = {
      id: id || generateId(),
      name,
      quantity,
      unit,
      expiry
    };

    await saveRecord("ingredients", ingredient);

    closeModal(document.getElementById("ingredient-modal"));

    await refreshIngredients();

    showToast(id ? "Ingredient updated!" : "Ingredient added!");
  });


document.getElementById("ingredient-search")
  ?.addEventListener("input", renderInventory);


// =========================================
// 8. INGREDIENT ACTION BUTTONS
// =========================================

document.addEventListener("click", async event => {

  const editButton = event.target.closest(
    '[data-action="edit-ingredient"]'
  );

  const deleteButton = event.target.closest(
    '[data-action="delete-ingredient"]'
  );

  if (editButton) {
    const item = getIngredientById(editButton.dataset.id);

    if (item) openIngredientForm(item);
  }

  if (deleteButton) {
    const id = deleteButton.dataset.id;
    const item = getIngredientById(id);

    if (!item) return;

    const confirmed = confirm(
      `Delete ${item.name} from your inventory?`
    );

    if (!confirmed) return;

    await deleteRecord("ingredients", id);

    await refreshIngredients();

    showToast("Ingredient deleted.");
  }

});


// =========================================
// 9. RECIPE INGREDIENT ROWS
// =========================================

function createRecipeIngredientRow(selectedId = "", quantity = "", unit = "pcs") {

  const row = document.createElement("div");

  row.className = "recipe-ingredient-row";

  const options = allIngredients.map(item => `
    <option
      value="${escapeHTML(item.id)}"
      ${item.id === selectedId ? "selected" : ""}
    >
      ${escapeHTML(item.name)}
    </option>
  `).join("");

  row.innerHTML = `
    <select class="recipe-ingredient-select" required>
      <option value="">Select ingredient</option>
      ${options}
    </select>

    <input
      type="number"
      class="recipe-quantity"
      min="0"
      step="any"
      placeholder="Quantity"
      value="${escapeHTML(quantity)}"
      required
    >

    <select class="recipe-unit" required>
      <option value="pcs" ${unit === "pcs" ? "selected" : ""}>Pieces</option>
      <option value="g" ${unit === "g" ? "selected" : ""}>Grams</option>
      <option value="kg" ${unit === "kg" ? "selected" : ""}>Kg</option>
      <option value="ml" ${unit === "ml" ? "selected" : ""}>Ml</option>
      <option value="l" ${unit === "l" ? "selected" : ""}>Litres</option>
      <option value="tsp" ${unit === "tsp" ? "selected" : ""}>Tsp</option>
      <option value="tbsp" ${unit === "tbsp" ? "selected" : ""}>Tbsp</option>
      <option value="packets" ${unit === "packets" ? "selected" : ""}>Packets</option>
      <option value="bottles" ${unit === "bottles" ? "selected" : ""}>Bottles</option>
      <option value="pinches" ${unit === "pinches" ? "selected" : ""}>Pinches</option>
      <option value="available" ${unit === "available" ? "selected" : ""}>Available</option>
    </select>

    <button type="button" class="remove-row-btn">
      Remove ingredient
    </button>
  `;

  return row;
}


document.getElementById("add-recipe-ingredient")
  ?.addEventListener("click", () => {

    document.getElementById("recipe-ingredients-list")
      .appendChild(createRecipeIngredientRow());

  });


document.getElementById("recipe-ingredients-list")
  ?.addEventListener("click", event => {

    if (event.target.classList.contains("remove-row-btn")) {
      event.target.closest(".recipe-ingredient-row").remove();
    }

  });


// =========================================
// 10. YOUTUBE VIDEO ROWS
// =========================================

function createVideoRow(url = "") {
  const row = document.createElement("div");

  row.className = "video-link-row";

  row.innerHTML = `
    <input
      type="url"
      class="dish-video-input"
      placeholder="Paste YouTube URL"
      value="${escapeHTML(url)}"
    >

    <button type="button" class="remove-row-btn">
      Remove link
    </button>
  `;

  return row;
}


document.getElementById("add-video-link")
  ?.addEventListener("click", () => {

    document.getElementById("dish-video-links")
      .appendChild(createVideoRow());

  });


document.getElementById("dish-video-links")
  ?.addEventListener("click", event => {

    if (event.target.classList.contains("remove-row-btn")) {
      event.target.closest(".video-link-row").remove();
    }

  });


// =========================================
// 11. ADD / EDIT DISH
// =========================================

function openDishForm(dish = null) {

  document.getElementById("dish-form").reset();

  document.getElementById("dish-id").value =
    dish?.id || "";

  document.getElementById("dish-name").value =
    dish?.name || "";

  document.getElementById("dish-category").value =
    dish?.category || "Breakfast";

  document.getElementById("dish-icon").value =
    dish?.icon || "🍲";

  document.getElementById("dish-notes").value =
    dish?.notes || "";

  document.getElementById("dish-modal-title").textContent =
    dish ? "Edit Dish" : "Add New Dish";

  const ingredientContainer =
    document.getElementById("recipe-ingredients-list");

  ingredientContainer.innerHTML = "";

  if (dish?.ingredients?.length) {
    dish.ingredients.forEach(item => {
      ingredientContainer.appendChild(
        createRecipeIngredientRow(
          item.ingredientId,
          item.quantity,
          item.unit
        )
      );
    });
  }

  const videoContainer =
    document.getElementById("dish-video-links");

  videoContainer.innerHTML = "";

  if (dish?.videos?.length) {
    dish.videos.forEach(url => {
      videoContainer.appendChild(createVideoRow(url));
    });
  }

  openModal("dish-modal");
}


document.getElementById("add-dish-btn")
  ?.addEventListener("click", () => openDishForm());


document.getElementById("add-dish-dashboard")
  ?.addEventListener("click", () => openDishForm());


function isValidYouTubeURL(value) {
  try {
    const url = new URL(value);

    return [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be",
      "www.youtu.be"
    ].includes(url.hostname);
  } catch {
    return false;
  }
}


document.getElementById("dish-form")
  ?.addEventListener("submit", async event => {

    event.preventDefault();

    const id = document.getElementById("dish-id").value;

    const name = document.getElementById("dish-name")
      .value.trim();

    const category = document.getElementById("dish-category").value;

    const icon = document.getElementById("dish-icon").value.trim() || "🍲";

    const notes = document.getElementById("dish-notes").value.trim();

    const ingredientRows = [
      ...document.querySelectorAll(".recipe-ingredient-row")
    ];

    const ingredients = [];

    for (const row of ingredientRows) {
      const ingredientId = row.querySelector(
        ".recipe-ingredient-select"
      ).value;

      const quantity = Number(
        row.querySelector(".recipe-quantity").value
      );

      const unit = row.querySelector(".recipe-unit").value;

      if (!ingredientId) {
        showToast("Please select every recipe ingredient.");
        return;
      }

      if (!Number.isFinite(quantity) || quantity < 0) {
        showToast("Please enter a valid recipe quantity.");
        return;
      }

      ingredients.push({
        ingredientId,
        quantity,
        unit
      });
    }

    const videoInputs = [
      ...document.querySelectorAll(".dish-video-input")
    ];

    const videos = [];

    for (const input of videoInputs) {
      const url = input.value.trim();

      if (!url) continue;

      if (!isValidYouTubeURL(url)) {
        showToast("Please enter a valid YouTube link.");
        input.focus();
        return;
      }

      videos.push(url);
    }

    if (!name) {
      showToast("Please enter a dish name.");
      return;
    }

    const dish = {
      id: id || generateId(),
      name,
      category,
      icon,
      notes,
      ingredients,
      videos
    };

    await saveRecord("dishes", dish);

    closeModal(document.getElementById("dish-modal"));

    await refreshDishes();

    showToast(id ? "Dish updated!" : "Dish added!");
  });


// =========================================
// 12. DISH CARDS
// =========================================

function createDishCard(dish) {

  const result = getDishStatus(dish);

  return `
    <div class="dish-card">

      <div class="dish-card-header">

        <div class="dish-icon">
          ${escapeHTML(dish.icon || "🍲")}
        </div>

        <div class="dish-card-info">
          <h3>${escapeHTML(dish.name)}</h3>
          <p>${escapeHTML(dish.category || "Other")}</p>
        </div>

        <span class="dish-status ${result.status}">
          ${statusLabel(result.status)}
        </span>

      </div>

      <div class="dish-card-footer">
        <span>
          ${result.ready}/${result.total} ingredients available
        </span>
        <span>${result.missing} missing</span>
      </div>

      <div class="dish-card-actions">

        <button
          class="view-btn"
          data-action="view-dish"
          data-id="${escapeHTML(dish.id)}"
        >View</button>

        <button
          class="edit-btn"
          data-action="edit-dish"
          data-id="${escapeHTML(dish.id)}"
        >Edit</button>

        <button
          class="delete-btn"
          data-action="delete-dish"
          data-id="${escapeHTML(dish.id)}"
        >Delete</button>

      </div>

    </div>
  `;
}


// =========================================
// 13. DASHBOARD
// =========================================

function renderDashboard() {

  const total = allDishes.length;

  let ready = 0;
  let partial = 0;
  let missing = 0;

  allDishes.forEach(dish => {
    const status = getDishStatus(dish).status;

    if (status === "ready") ready++;
    else if (status === "partial") partial++;
    else missing++;
  });

  document.getElementById("total-dishes").textContent = total;
  document.getElementById("ready-dishes").textContent = ready;
  document.getElementById("partial-dishes").textContent = partial;
  document.getElementById("unavailable-dishes").textContent = missing;

  const container = document.getElementById("dashboard-dishes");

  if (!container) return;

  let filtered = [...allDishes];

  if (currentFilter !== "all") {
    filtered = filtered.filter(dish =>
      getDishStatus(dish).status === currentFilter
    );
  }

  if (currentDashboardCategory !== "all") {
    filtered = filtered.filter(dish =>
      dish.category === currentDashboardCategory
    );
  }

  filtered.sort((a, b) => {
    const priority = {
      ready: 0,
      partial: 1,
      missing: 2
    };

    return priority[getDishStatus(a).status] -
      priority[getDishStatus(b).status];
  });

  container.innerHTML = filtered.length
    ? filtered.map(createDishCard).join("")
    : emptyState("No dishes found for this filter.", "🍽️");
}


document.querySelectorAll(".filter-btn").forEach(button => {

  button.addEventListener("click", () => {

    document.querySelectorAll(".filter-btn").forEach(btn => {
      btn.classList.remove("active");
    });

    button.classList.add("active");

    currentFilter = button.dataset.filter;

    renderDashboard();
  });

});


document.getElementById("dashboard-category")
  ?.addEventListener("change", event => {

    currentDashboardCategory = event.target.value;
    renderDashboard();

  });


// =========================================
// 14. ALL DISHES PAGE
// =========================================

function renderAllDishes() {

  const container = document.getElementById("all-dishes-container");

  if (!container) return;

  const search = (
    document.getElementById("dish-search")?.value || ""
  ).toLowerCase();

  const category =
    document.getElementById("dish-category-filter")?.value || "all";

  const filtered = allDishes.filter(dish => {

    const matchesName = dish.name.toLowerCase().includes(search);

    const matchesCategory =
      category === "all" || dish.category === category;

    return matchesName && matchesCategory;

  });

  container.innerHTML = filtered.length
    ? filtered.map(createDishCard).join("")
    : emptyState("No dishes found. Add your first recipe!", "🍲");
}


document.getElementById("dish-search")
  ?.addEventListener("input", renderAllDishes);


document.getElementById("dish-category-filter")
  ?.addEventListener("change", renderAllDishes);


// =========================================
// 15. DISH ACTION BUTTONS
// =========================================

document.addEventListener("click", async event => {

  const viewButton = event.target.closest(
    '[data-action="view-dish"]'
  );

  const editButton = event.target.closest(
    '[data-action="edit-dish"]'
  );

  const deleteButton = event.target.closest(
    '[data-action="delete-dish"]'
  );

  if (viewButton) {
    const dish = getDishById(viewButton.dataset.id);

    if (dish) showDishDetails(dish);
  }

  if (editButton) {
    const dish = getDishById(editButton.dataset.id);

    if (dish) openDishForm(dish);
  }

  if (deleteButton) {
    const id = deleteButton.dataset.id;
    const dish = getDishById(id);

    if (!dish) return;

    const confirmed = confirm(
      `Delete ${dish.name}?`
    );

    if (!confirmed) return;

    await deleteRecord("dishes", id);

    await refreshDishes();

    showToast("Dish deleted.");
  }

});


// =========================================
// 16. DISH DETAILS
// =========================================

function showDishDetails(dish) {

  const container = document.getElementById("dish-details-content");

  const result = getDishStatus(dish);

  const ingredientsHTML = (dish.ingredients || []).map(item => {

    const ingredient = getIngredientById(item.ingredientId);

    const availability = getRecipeIngredientStatus(item);

    const name = ingredient
      ? ingredient.name
      : "Unknown ingredient";

    return `
      <div class="detail-ingredient">

        <span>${escapeHTML(name)}</span>

        <strong>
          ${formatQuantity(item.quantity)}
          ${escapeHTML(item.unit)}
        </strong>

        <span class="dish-status ${availability.available ? "ready" : "missing"}">
          ${availability.available ? "Available" : "Missing"}
        </span>

      </div>
    `;

  }).join("");

  const videosHTML = (dish.videos || []).map((url, index) => `
    <a
      class="video-reference-link"
      href="${escapeHTML(url)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      ▶ Watch cooking video ${index + 1}
    </a>
  `).join("");

  container.innerHTML = `
    <div class="dish-detail-heading">
      <div class="dish-icon">
        ${escapeHTML(dish.icon || "🍲")}
      </div>

      <div>
        <h2>${escapeHTML(dish.name)}</h2>
        <p>${escapeHTML(dish.category || "Other")}</p>
      </div>
    </div>

    <div class="detail-status">
      <span class="dish-status ${result.status}">
        ${statusLabel(result.status)}
      </span>

      <p>${result.ready} of ${result.total} ingredients available</p>
    </div>

    <h3 class="detail-section-title">Ingredients</h3>

    <div class="detail-ingredient-list">
      ${ingredientsHTML || emptyState("No ingredients added yet.")}
    </div>

    ${dish.notes ? `
      <h3 class="detail-section-title">Preparation Notes</h3>
      <p class="dish-notes">${escapeHTML(dish.notes)}</p>
    ` : ""}

    ${dish.videos?.length ? `
      <h3 class="detail-section-title">YouTube References</h3>
      <div class="detail-video-list">
        ${videosHTML}
      </div>
    ` : ""}
  `;

  openModal("dish-details-modal");
}


// =========================================
// 17. REFRESH DISHES
// =========================================

async function refreshDishes() {

  allDishes = await getAllRecords("dishes");

  renderDashboard();
  renderAllDishes();
  renderShoppingSelection();
  renderPlanner();
  renderReferences();
}


// =========================================
// 18. SHOPPING LIST
// =========================================

let shoppingResults = [];


function renderShoppingSelection() {

  const container = document.getElementById(
    "shopping-dish-selection"
  );

  if (!container) return;

  if (!allDishes.length) {
    container.innerHTML = emptyState(
      "Add dishes before creating a shopping list.",
      "🛒"
    );
    return;
  }

  container.innerHTML = allDishes.map(dish => `
    <label class="shopping-dish-checkbox">
      <input
        type="checkbox"
        class="shopping-dish-checkbox-input"
        value="${escapeHTML(dish.id)}"
      >

      <span>
        ${escapeHTML(dish.icon || "🍲")}
        ${escapeHTML(dish.name)}
      </span>
    </label>
  `).join("");
}


document.getElementById("calculate-shopping")
  ?.addEventListener("click", async () => {

    const selected = [
      ...document.querySelectorAll(
        ".shopping-dish-checkbox-input:checked"
      )
    ].map(input => input.value);

    if (!selected.length) {
      showToast("Please select at least one dish.");
      return;
    }

    const totals = new Map();

    selected.forEach(dishId => {

      const dish = getDishById(dishId);

      if (!dish) return;

      (dish.ingredients || []).forEach(item => {

        const ingredient = getIngredientById(item.ingredientId);

        if (!ingredient) return;

        const key = item.ingredientId;

        if (!totals.has(key)) {
          totals.set(key, {
            ingredientId: key,
            name: ingredient.name,
            required: 0,
            unit: item.unit,
            compatible: true
          });
        }

        const entry = totals.get(key);

        if (entry.unit !== item.unit) {
          const converted = convertQuantity(
            item.quantity,
            item.unit,
            entry.unit
          );

          if (converted === null) {
            entry.compatible = false;
          } else {
            entry.required += converted;
          }
        } else {
          entry.required += Number(item.quantity) || 0;
        }

      });

    });

    shoppingResults = [];

    for (const entry of totals.values()) {

      const ingredient = getIngredientById(entry.ingredientId);

      if (!ingredient) continue;

      if (entry.unit === "available" ||
          ingredient.unit === "available") {

        if (Number(ingredient.quantity) <= 0) {
          shoppingResults.push({
            ...entry,
            missing: 1,
            unit: "available"
          });
        }

        continue;
      }

      if (!entry.compatible) {
        shoppingResults.push({
          ...entry,
          missing: null
        });

        continue;
      }

      const available = getAvailableQuantity(
        ingredient,
        entry.unit
      );

      const missing = Math.max(0, entry.required - available);

      if (missing > 0) {
        shoppingResults.push({
          ...entry,
          missing
        });
      }

    }

    await renderShoppingResults();

  });


async function renderShoppingResults() {

  const container = document.getElementById(
    "shopping-list-container"
  );

  if (!container) return;

  const saved = await getAllRecords("shopping");

  const checkedIds = new Set(
    saved.filter(item => item.checked).map(item => item.id)
  );

  if (!shoppingResults.length) {
    container.innerHTML = emptyState(
      "You already have everything needed for these dishes!",
      "🎉"
    );
    return;
  }

  container.innerHTML = shoppingResults.map(item => {

    const checked = checkedIds.has(item.ingredientId);

    const amount = item.missing === null
      ? "Please check unit compatibility"
      : item.unit === "available"
        ? "1 item needed"
        : `${formatQuantity(item.missing)} ${escapeHTML(item.unit)}`;

    return `
      <div class="shopping-item">

        <input
          type="checkbox"
          class="shopping-check"
          data-id="${escapeHTML(item.ingredientId)}"
          ${checked ? "checked" : ""}
        >

        <div style="flex:1">
          <strong>${escapeHTML(item.name)}</strong>
          <p>${amount}</p>
        </div>

      </div>
    `;

  }).join("");
}


document.getElementById("shopping-list-container")
  ?.addEventListener("change", async event => {

    if (!event.target.classList.contains("shopping-check")) return;

    const id = event.target.dataset.id;

    await saveRecord("shopping", {
      id,
      checked: event.target.checked
    });

  });


// =========================================
// 19. WEEKLY MEAL PLANNER
// =========================================

function getMonday(date) {

  const monday = new Date(date);
  const day = monday.getDay();

  const difference = day === 0 ? -6 : 1 - day;

  monday.setDate(monday.getDate() + difference);
  monday.setHours(0, 0, 0, 0);

  return monday;
}


function dateKey(date) {

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function formatDate(date) {

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short"
  });
}


async function renderPlanner() {

  const container = document.getElementById("weekly-planner");

  if (!container) return;

  const monday = getMonday(currentPlannerDate);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  document.getElementById("week-label").textContent =
    `${formatDate(monday)} - ${formatDate(sunday)}`;

  const plannerRecords = await getAllRecords("planner");

  const plannerMap = new Map(
    plannerRecords.map(item => [item.id, item])
  );

  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
  ];

  const dishOptions = allDishes.map(dish => `
    <option value="${escapeHTML(dish.id)}">
      ${escapeHTML(dish.name)}
    </option>
  `).join("");

  container.innerHTML = days.map((day, index) => {

    const date = new Date(monday);
    date.setDate(monday.getDate() + index);

    const key = dateKey(date);
    const saved = plannerMap.get(key) || {};

    return `
      <div class="planner-day">

        <h3>${day} · ${formatDate(date)}</h3>

        <label>🌅 Breakfast</label>
        <select class="planner-select"
          data-date="${key}"
          data-meal="breakfast">

          <option value="">Choose breakfast</option>
          ${dishOptions}

        </select>

        <label>☀️ Lunch</label>
        <select class="planner-select"
          data-date="${key}"
          data-meal="lunch">

          <option value="">Choose lunch</option>
          ${dishOptions}

        </select>

        <label>🌙 Dinner</label>
        <select class="planner-select"
          data-date="${key}"
          data-meal="dinner">

          <option value="">Choose dinner</option>
          ${dishOptions}

        </select>

      </div>
    `;

  }).join("");

  document.querySelectorAll(".planner-select").forEach(select => {

    const record = plannerMap.get(select.dataset.date);

    if (record) {
      select.value = record[select.dataset.meal] || "";
    }

  });

}


document.getElementById("weekly-planner")
  ?.addEventListener("change", async event => {

    if (!event.target.classList.contains("planner-select")) return;

    const date = event.target.dataset.date;

    const records = await getAllRecords("planner");

    const existing = records.find(item => item.id === date) || {
      id: date,
      breakfast: "",
      lunch: "",
      dinner: ""
    };

    existing[event.target.dataset.meal] = event.target.value;

    await saveRecord("planner", existing);

    showToast("Meal plan saved.");

  });


document.getElementById("previous-week")
  ?.addEventListener("click", () => {

    currentPlannerDate.setDate(
      currentPlannerDate.getDate() - 7
    );

    renderPlanner();

  });


document.getElementById("next-week")
  ?.addEventListener("click", () => {

    currentPlannerDate.setDate(
      currentPlannerDate.getDate() + 7
    );

    renderPlanner();

  });


// =========================================
// 20. RECIPE REFERENCES
// =========================================

function renderReferences() {

  const container = document.getElementById(
    "references-container"
  );

  if (!container) return;

  const search = (
    document.getElementById("reference-search")?.value || ""
  ).toLowerCase();

  const references = [];

  allDishes.forEach(dish => {

    (dish.videos || []).forEach(url => {

      references.push({
        dishName: dish.name,
        url
      });

    });

  });

  const filtered = references.filter(item =>
    item.dishName.toLowerCase().includes(search)
  );

  if (!filtered.length) {
    container.innerHTML = emptyState(
      "No saved YouTube references found.",
      "▶"
    );
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="reference-card">

      <h3>${escapeHTML(item.dishName)}</h3>

      <a
        href="${escapeHTML(item.url)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ▶ Watch YouTube Recipe
      </a>

    </div>
  `).join("");

}


document.getElementById("reference-search")
  ?.addEventListener("input", renderReferences);


// =========================================
// 21. JSON BACKUP / EXPORT
// =========================================

document.getElementById("export-btn")
  ?.addEventListener("click", async () => {

    const data = {
      app: "Germany Kitchen Planner",
      version: 1,
      exportedAt: new Date().toISOString(),

      ingredients: await getAllRecords("ingredients"),
      dishes: await getAllRecords("dishes"),
      planner: await getAllRecords("planner"),
      shopping: await getAllRecords("shopping")
    };

    const blob = new Blob(
      [JSON.stringify(data, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = `germany-kitchen-backup-${todayString()}.json`;

    link.click();

    URL.revokeObjectURL(url);

    showToast("Backup downloaded.");
  });


// =========================================
// 22. JSON IMPORT
// =========================================

document.getElementById("import-btn")
  ?.addEventListener("click", () => {

    document.getElementById("import-file").click();

  });


document.getElementById("import-file")
  ?.addEventListener("change", async event => {

    const file = event.target.files[0];

    if (!file) return;

    try {

      const text = await file.text();
      const data = JSON.parse(text);

      if (
        !Array.isArray(data.ingredients) ||
        !Array.isArray(data.dishes) ||
        !Array.isArray(data.planner) ||
        !Array.isArray(data.shopping)
      ) {
        throw new Error("Invalid backup file");
      }

      const confirmed = confirm(
        "Importing this backup will replace your current kitchen data. Continue?"
      );

      if (!confirmed) {
        event.target.value = "";
        return;
      }

      await clearStore("ingredients");
      await clearStore("dishes");
      await clearStore("planner");
      await clearStore("shopping");

      for (const item of data.ingredients) {
        await saveRecord("ingredients", item);
      }

      for (const item of data.dishes) {
        await saveRecord("dishes", item);
      }

      for (const item of data.planner) {
        await saveRecord("planner", item);
      }

      for (const item of data.shopping) {
        await saveRecord("shopping", item);
      }

      await refreshIngredients();
      await refreshDishes();

      renderPlanner();
      renderShoppingSelection();

      showToast("Backup imported successfully.");

    } catch (error) {

      console.error(error);
      showToast("Invalid backup file.");

    }

    event.target.value = "";

  });


// =========================================
// 23. INITIALIZE APP
// =========================================


// =========================================
// 23. INITIALIZE KITCHEN PLANNER
// =========================================

async function initializeKitchenPlanner() {

  // Prevent opening the same database multiple times
  if (db) return;

  try {

    db = await openDatabase();

    allIngredients = await getAllRecords("ingredients");
    allDishes = await getAllRecords("dishes");

    renderDashboard();
    renderInventory();
    renderAllDishes();
    renderShoppingSelection();
    renderPlanner();
    renderReferences();

    navigateTo("dashboard");

    console.log("Germany Kitchen Planner ready.");

  } catch (error) {

    console.error("Database error:", error);

    showToast("Unable to open kitchen database.");

  }

}


// =========================================
// 24. APPLICATION START
// =========================================

document.addEventListener("DOMContentLoaded", () => {

  initializeAuthentication();

});
