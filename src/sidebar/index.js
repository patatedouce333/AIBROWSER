// Sidebar UI script - JavaScript version
console.log('Cometeor sidebar loaded');

// Simple UI setup
document.addEventListener('DOMContentLoaded', () => {
  const taskInput = document.getElementById('taskInput');
  const sendButton = document.getElementById('sendButton');
  const authStatus = document.getElementById('authStatus');

  if (authStatus) {
    authStatus.textContent = 'Not connected to AI service';
    authStatus.classList.add('error');
  }

  if (sendButton) {
    sendButton.addEventListener('click', () => {
      const description = taskInput?.value?.trim();
      if (description) {
        console.log('Task requested:', description);
      }
    });
  }
});