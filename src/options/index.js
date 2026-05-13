// Options page script - JavaScript version
console.log('Cometeor options loaded');

document.addEventListener('DOMContentLoaded', () => {
  const saveButton = document.getElementById('saveButton');
  const statusDiv = document.getElementById('status');

  if (saveButton) {
    saveButton.addEventListener('click', async () => {
      const projectIdInput = document.getElementById('projectId');
      const regionSelect = document.getElementById('region');
      const modelSelect = document.getElementById('model');

      const projectId = projectIdInput?.value?.trim();
      const region = regionSelect?.value;
      const model = modelSelect?.value;

      if (!projectId) {
        if (statusDiv) {
          statusDiv.textContent = 'Please enter a Project ID';
          statusDiv.className = 'status error';
          statusDiv.style.display = 'block';
        }
        return;
      }

      try {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          await chrome.storage.sync.set({ projectId, region, model });

          // Notify background script of configuration update
          chrome.runtime.sendMessage({
            type: 'CONFIG_UPDATED',
            config: { projectId, region, model }
          });
        }
        if (statusDiv) {
          statusDiv.textContent = 'Settings saved successfully!';
          statusDiv.className = 'status success';
          statusDiv.style.display = 'block';

          setTimeout(() => {
            statusDiv.style.display = 'none';
          }, 3000);
        }
      } catch (error) {
        console.error('Failed to save settings:', error);
        if (statusDiv) {
          statusDiv.textContent = 'Failed to save settings';
          statusDiv.className = 'status error';
          statusDiv.style.display = 'block';
        }
      }
    });
  }
});