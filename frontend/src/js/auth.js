function getCookie() {
  return document.cookie.split('; ').reduce((acc, item) => {
    const [name, value] = item.split('=');
    acc[name] = value;
    return acc;
  }, {})
}

function isAuthenticated() {
  const cookies = getCookie();
  return cookies.token;
}

export function relocateToLogin() {
  const isAuth = isAuthenticated();
  const currentLocation = window.location.pathname;

  if (!isAuth) {
    if (['/pages/login.html','/pages/registration.html'].includes(currentLocation)) {
      return;
    }
    window.location.href = '/pages/login.html';
  }

  if (['/pages/login.html', '/pages/registration.html', '/index.html', '/'].includes(currentLocation)) {
    window.location.href = '/pages/profile.html';
  }

  return;
}
