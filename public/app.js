// State management
let state = {
  user: null,
  recipes: [],
  currentRecipe: null,
  view: 'feed' // feed, recipe, login, register, create
};

// API helpers
const api = {
  async request(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      
      if (!response.ok && response.status !== 401) {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка сервера');
      }
      
      return response.json();
    } catch (err) {
      console.error('API Error:', err);
      throw err;
    }
  },

  async checkAuth() {
    return this.request('/api/auth/check');
  },

  async login(username, password) {
    return this.request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async register(username, password) {
    return this.request('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async logout() {
    return this.request('/api/logout', { method: 'POST' });
  },

  async getRecipes() {
    return this.request('/api/recipes');
  },

  async getRecipe(id) {
    return this.request(`/api/recipes/${id}`);
  },

  async createRecipe(formData) {
    const response = await fetch('/api/recipes', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Ошибка создания рецепта');
    }
    
    return response.json();
  },

  async rateRecipe(recipeId, rating, comment) {
    return this.request(`/api/recipes/${recipeId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    });
  }
};

// View helpers
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-toast';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  
  setTimeout(() => errorDiv.classList.add('show'), 10);
  setTimeout(() => {
    errorDiv.classList.remove('show');
    setTimeout(() => errorDiv.remove(), 300);
  }, 3000);
}

function showSuccess(message) {
  const successDiv = document.createElement('div');
  successDiv.className = 'success-toast';
  successDiv.textContent = message;
  document.body.appendChild(successDiv);
  
  setTimeout(() => successDiv.classList.add('show'), 10);
  setTimeout(() => {
    successDiv.classList.remove('show');
    setTimeout(() => successDiv.remove(), 300);
  }, 3000);
}

// Components
function Header() {
  return `
    <header class="header">
      <div class="header-content">
        <h1 class="logo" onclick="navigateTo('feed')">🍳 Рецепты</h1>
        ${state.user ? `
          <div class="header-actions">
            <button class="btn btn-primary" onclick="navigateTo('create')">
              ➕ Добавить
            </button>
            <div class="user-menu">
              <span class="username">👤 ${state.user.username}</span>
              <button class="btn btn-secondary" onclick="handleLogout()">Выйти</button>
            </div>
          </div>
        ` : `
          <div class="header-actions">
            <button class="btn btn-secondary" onclick="navigateTo('login')">Войти</button>
            <button class="btn btn-primary" onclick="navigateTo('register')">Регистрация</button>
          </div>
        `}
      </div>
    </header>
  `;
}

function LoginView() {
  return `
    <div class="auth-container">
      <div class="auth-card">
        <h2>Вход</h2>
        <form onsubmit="handleLogin(event)">
          <div class="form-group">
            <label>Логин</label>
            <input type="text" name="username" required autocomplete="username">
          </div>
          <div class="form-group">
            <label>Пароль</label>
            <input type="password" name="password" required autocomplete="current-password">
          </div>
          <button type="submit" class="btn btn-primary btn-block">Войти</button>
        </form>
        <p class="auth-link">
          Нет аккаунта? <a href="#" onclick="navigateTo('register'); return false;">Зарегистрируйтесь</a>
        </p>
      </div>
    </div>
  `;
}

function RegisterView() {
  return `
    <div class="auth-container">
      <div class="auth-card">
        <h2>Регистрация</h2>
        <form onsubmit="handleRegister(event)">
          <div class="form-group">
            <label>Логин</label>
            <input type="text" name="username" required autocomplete="username">
          </div>
          <div class="form-group">
            <label>Пароль (минимум 6 символов)</label>
            <input type="password" name="password" required minlength="6" autocomplete="new-password">
          </div>
          <button type="submit" class="btn btn-primary btn-block">Зарегистрироваться</button>
        </form>
        <p class="auth-link">
          Уже есть аккаунт? <a href="#" onclick="navigateTo('login'); return false;">Войдите</a>
        </p>
      </div>
    </div>
  `;
}

function FeedView() {
  if (!state.user) {
    return `
      <div class="welcome-screen">
        <div class="welcome-content">
          <h2>🍳 Добро пожаловать в Книгу рецептов!</h2>
          <p>Делитесь своими любимыми рецептами с друзьями</p>
          <div class="welcome-actions">
            <button class="btn btn-primary" onclick="navigateTo('register')">Начать</button>
            <button class="btn btn-secondary" onclick="navigateTo('login')">Войти</button>
          </div>
        </div>
      </div>
    `;
  }

  if (state.recipes.length === 0) {
    return `
      <div class="empty-state">
        <h3>Пока нет рецептов</h3>
        <p>Будьте первым, кто добавит рецепт!</p>
        <button class="btn btn-primary" onclick="navigateTo('create')">➕ Добавить рецепт</button>
      </div>
    `;
  }

  return `
    <div class="feed">
      ${state.recipes.map(recipe => RecipeCard(recipe)).join('')}
    </div>
  `;
}

function RecipeCard(recipe) {
  const avgRating = parseFloat(recipe.avg_rating).toFixed(1);
  const ratingCount = parseInt(recipe.rating_count);
  
  return `
    <div class="recipe-card" onclick="navigateTo('recipe', ${recipe.id})">
      <div class="recipe-image" style="background-image: url('${recipe.image_url || '/placeholder.jpg'}')"></div>
      <div class="recipe-card-content">
        <h3>${recipe.title}</h3>
        <p class="recipe-description">${recipe.description || 'Без описания'}</p>
        <div class="recipe-meta">
          <span class="recipe-author">👤 ${recipe.username}</span>
          <span class="recipe-rating">
            ⭐ ${avgRating} ${ratingCount > 0 ? `(${ratingCount})` : ''}
          </span>
        </div>
      </div>
    </div>
  `;
}

function RecipeDetailView() {
  if (!state.currentRecipe) {
    return '<div class="loading">Загрузка...</div>';
  }

  const { recipe, ratings } = state.currentRecipe;
  const avgRating = parseFloat(recipe.avg_rating).toFixed(1);
  const ratingCount = parseInt(recipe.rating_count);
  
  const userRating = ratings.find(r => r.user_id === state.user?.id);
  
  return `
    <div class="recipe-detail">
      <button class="btn btn-back" onclick="navigateTo('feed')">← Назад</button>
      
      <div class="recipe-header">
        <img src="${recipe.image_url || '/placeholder.jpg'}" alt="${recipe.title}" class="recipe-detail-image">
        <div class="recipe-info">
          <h2>${recipe.title}</h2>
          <p class="recipe-author">Автор: ${recipe.username}</p>
          <div class="recipe-rating-large">
            <span class="rating-stars">⭐ ${avgRating}</span>
            <span class="rating-count">${ratingCount} ${ratingCount === 1 ? 'оценка' : 'оценок'}</span>
          </div>
        </div>
      </div>

      ${recipe.description ? `<p class="recipe-description-full">${recipe.description}</p>` : ''}

      <div class="recipe-section">
        <h3>📝 Ингредиенты</h3>
        <div class="ingredients-list">${formatIngredients(recipe.ingredients)}</div>
      </div>

      <div class="recipe-section">
        <h3>👨‍🍳 Приготовление</h3>
        <div class="instructions">${formatInstructions(recipe.instructions)}</div>
      </div>

      ${state.user ? `
        <div class="recipe-section">
          <h3>⭐ Ваша оценка</h3>
          <form onsubmit="handleRating(event)" class="rating-form">
            <div class="star-rating">
              ${[1, 2, 3, 4, 5].map(star => `
                <span class="star ${userRating && userRating.rating >= star ? 'active' : ''}" 
                      onclick="selectRating(${star})">★</span>
              `).join('')}
            </div>
            <input type="hidden" name="rating" id="rating-input" value="${userRating ? userRating.rating : ''}" required>
            <textarea name="comment" placeholder="Ваш комментарий (необязательно)" rows="3">${userRating ? userRating.comment || '' : ''}</textarea>
            <button type="submit" class="btn btn-primary">Оценить</button>
          </form>
        </div>
      ` : ''}

      <div class="recipe-section">
        <h3>💬 Отзывы (${ratings.length})</h3>
        ${ratings.length > 0 ? `
          <div class="ratings-list">
            ${ratings.map(rating => `
              <div class="rating-item">
                <div class="rating-header">
                  <span class="rating-user">${rating.username}</span>
                  <span class="rating-stars">${'⭐'.repeat(rating.rating)}</span>
                </div>
                ${rating.comment ? `<p class="rating-comment">${rating.comment}</p>` : ''}
                <span class="rating-date">${new Date(rating.created_at).toLocaleDateString('ru-RU')}</span>
              </div>
            `).join('')}
          </div>
        ` : '<p class="empty-ratings">Пока нет отзывов</p>'}
      </div>
    </div>
  `;
}

function formatIngredients(ingredients) {
  return ingredients.split('\n')
    .filter(line => line.trim())
    .map(line => `<div class="ingredient-item">• ${line}</div>`)
    .join('');
}

function formatInstructions(instructions) {
  const steps = instructions.split('\n').filter(line => line.trim());
  return steps.map((step, index) => 
    `<div class="instruction-step">
      <span class="step-number">${index + 1}</span>
      <span class="step-text">${step}</span>
    </div>`
  ).join('');
}

function CreateRecipeView() {
  return `
    <div class="create-recipe-container">
      <button class="btn btn-back" onclick="navigateTo('feed')">← Назад</button>
      
      <h2>➕ Новый рецепт</h2>
      
      <form onsubmit="handleCreateRecipe(event)" class="create-recipe-form">
        <div class="form-group">
          <label>Название *</label>
          <input type="text" name="title" required placeholder="Например: Борщ по-украински">
        </div>

        <div class="form-group">
          <label>Фото</label>
          <input type="file" name="image" accept="image/*" onchange="previewImage(event)">
          <div id="image-preview"></div>
        </div>

        <div class="form-group">
          <label>Краткое описание</label>
          <textarea name="description" rows="2" placeholder="О чем этот рецепт..."></textarea>
        </div>

        <div class="form-group">
          <label>Ингредиенты * (каждый с новой строки)</label>
          <textarea name="ingredients" rows="8" required placeholder="Например:
2 стакана муки
1 яйцо
100 мл молока
Щепотка соли"></textarea>
        </div>

        <div class="form-group">
          <label>Инструкция * (каждый шаг с новой строки)</label>
          <textarea name="instructions" rows="10" required placeholder="Например:
Смешайте муку с солью
Добавьте яйцо и молоко
Замесите тесто
Дайте постоять 30 минут"></textarea>
        </div>

        <button type="submit" class="btn btn-primary btn-block">Создать рецепт</button>
      </form>
    </div>
  `;
}

// Event handlers
async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  
  try {
    const result = await api.login(formData.get('username'), formData.get('password'));
    state.user = result.user;
    await loadRecipes();
    navigateTo('feed');
    showSuccess('Добро пожаловать!');
  } catch (err) {
    showError(err.message);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  
  try {
    const result = await api.register(formData.get('username'), formData.get('password'));
    state.user = result.user;
    await loadRecipes();
    navigateTo('feed');
    showSuccess('Регистрация успешна!');
  } catch (err) {
    showError(err.message);
  }
}

async function handleLogout() {
  try {
    await api.logout();
    state.user = null;
    state.recipes = [];
    navigateTo('feed');
    showSuccess('Вы вышли из аккаунта');
  } catch (err) {
    showError(err.message);
  }
}

async function handleCreateRecipe(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  
  try {
    await api.createRecipe(formData);
    await loadRecipes();
    navigateTo('feed');
    showSuccess('Рецепт создан!');
  } catch (err) {
    showError(err.message);
  }
}

async function handleRating(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const rating = formData.get('rating');
  const comment = formData.get('comment');
  
  if (!rating) {
    showError('Выберите оценку');
    return;
  }
  
  try {
    await api.rateRecipe(state.currentRecipe.recipe.id, rating, comment);
    await loadRecipe(state.currentRecipe.recipe.id);
    showSuccess('Оценка добавлена!');
  } catch (err) {
    showError(err.message);
  }
}

function selectRating(stars) {
  document.getElementById('rating-input').value = stars;
  document.querySelectorAll('.star').forEach((star, index) => {
    if (index < stars) {
      star.classList.add('active');
    } else {
      star.classList.remove('active');
    }
  });
}

function previewImage(event) {
  const file = event.target.files[0];
  const preview = document.getElementById('image-preview');
  
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 100%; border-radius: 8px; margin-top: 10px;">`;
    };
    reader.readAsDataURL(file);
  }
}

// Navigation
async function navigateTo(view, recipeId = null) {
  state.view = view;
  
  if (view === 'recipe' && recipeId) {
    await loadRecipe(recipeId);
  }
  
  render();
  window.scrollTo(0, 0);
}

// Data loading
async function loadRecipes() {
  try {
    state.recipes = await api.getRecipes();
  } catch (err) {
    showError('Ошибка загрузки рецептов');
  }
}

async function loadRecipe(id) {
  try {
    state.currentRecipe = await api.getRecipe(id);
  } catch (err) {
    showError('Ошибка загрузки рецепта');
    navigateTo('feed');
  }
}

// Render
function render() {
  const app = document.getElementById('app');
  
  let content = '';
  
  switch (state.view) {
    case 'login':
      content = LoginView();
      break;
    case 'register':
      content = RegisterView();
      break;
    case 'create':
      content = Header() + CreateRecipeView();
      break;
    case 'recipe':
      content = Header() + RecipeDetailView();
      break;
    default:
      content = Header() + FeedView();
  }
  
  app.innerHTML = content;
}

// Initialize app
async function init() {
  try {
    const authCheck = await api.checkAuth();
    if (authCheck.authenticated) {
      state.user = authCheck.user;
      await loadRecipes();
    }
  } catch (err) {
    console.error('Auth check failed:', err);
  }
  
  render();
}

init();
