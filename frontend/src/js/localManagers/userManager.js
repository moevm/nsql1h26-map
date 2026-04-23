export const userManager = {
  save: function(user) {
    localStorage.setItem('user', user);
  },

  get: function() {
    return JSON.parse(localStorage.getItem('user'));
  },

  delete: function() {
    localStorage.removeItem('user');
  }
}