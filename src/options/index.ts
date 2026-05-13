console.log('Cometeor options loaded');

interface CometeorSettings {
  inception_api_key: string;
  model: string;
  maxTokens: number;
  temperature: number;
  enableMutationWatching: boolean;
  humanizedInput: boolean;
}

class OptionsPage {
  private apiKeyInput: HTMLInputElement;
  private toggleKeyButton: HTMLButtonElement;
  private modelSelect: HTMLSelectElement;
  private temperatureInput: HTMLInputElement;
  private maxTokensInput: HTMLInputElement;
  private mutationWatchingCheckbox: HTMLInputElement;
  private humanizedInputCheckbox: HTMLInputElement;
  private saveButton: HTMLButtonElement;
  private testConnectionButton: HTMLButtonElement;
  private statusDiv: HTMLElement;

  constructor() {
    this.apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
    this.toggleKeyButton = document.getElementById('toggleKey') as HTMLButtonElement;
    this.modelSelect = document.getElementById('model') as HTMLSelectElement;
    this.temperatureInput = document.getElementById('temperature') as HTMLInputElement;
    this.maxTokensInput = document.getElementById('maxTokens') as HTMLInputElement;
    this.mutationWatchingCheckbox = document.getElementById('enableMutationWatching') as HTMLInputElement;
    this.humanizedInputCheckbox = document.getElementById('humanizedInput') as HTMLInputElement;
    this.saveButton = document.getElementById('saveButton') as HTMLButtonElement;
    this.testConnectionButton = document.getElementById('testConnectionButton') as HTMLButtonElement;
    this.statusDiv = document.getElementById('status') as HTMLElement;

    this.init();
    this.loadSettings();
  }

  private init() {
    this.saveButton.addEventListener('click', () => this.saveSettings());
    this.testConnectionButton.addEventListener('click', () => this.testConnection());

    this.toggleKeyButton.addEventListener('click', () => {
      const isPassword = this.apiKeyInput.type === 'password';
      this.apiKeyInput.type = isPassword ? 'text' : 'password';
      this.toggleKeyButton.textContent = isPassword ? 'Hide' : 'Show';
    });

    this.apiKeyInput.addEventListener('input', () => this.validateInputs());

    this.temperatureInput.addEventListener('input', () => {
      (document.getElementById('temperatureValue') as HTMLElement).textContent = this.temperatureInput.value;
    });

    this.maxTokensInput.addEventListener('input', () => {
      (document.getElementById('maxTokensValue') as HTMLElement).textContent = this.maxTokensInput.value;
    });

    this.validateInputs();
  }

  private async loadSettings() {
    try {
      const s = await new Promise<Partial<CometeorSettings>>((resolve) => {
        chrome.storage.sync.get(null, (result) => resolve(result));
      });

      this.apiKeyInput.value = s.inception_api_key || '';
      this.modelSelect.value = s.model || 'mercury-2';
      this.temperatureInput.value = String(s.temperature ?? 0.2);
      this.maxTokensInput.value = String(s.maxTokens ?? 4096);
      this.mutationWatchingCheckbox.checked = s.enableMutationWatching ?? true;
      this.humanizedInputCheckbox.checked = s.humanizedInput ?? true;

      (document.getElementById('temperatureValue') as HTMLElement).textContent = this.temperatureInput.value;
      (document.getElementById('maxTokensValue') as HTMLElement).textContent = this.maxTokensInput.value;

      this.validateInputs();
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.showStatus('Failed to load settings', 'error');
    }
  }

  private async saveSettings() {
    if (!this.validateInputs()) return;

    const settings: CometeorSettings = {
      inception_api_key: this.apiKeyInput.value.trim(),
      model: this.modelSelect.value,
      temperature: parseFloat(this.temperatureInput.value),
      maxTokens: parseInt(this.maxTokensInput.value),
      enableMutationWatching: this.mutationWatchingCheckbox.checked,
      humanizedInput: this.humanizedInputCheckbox.checked,
    };

    try {
      await chrome.storage.sync.set(settings);
      chrome.runtime.sendMessage({ type: 'CONFIG_UPDATED', config: settings });
      this.showStatus('Settings saved!', 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showStatus('Failed to save settings', 'error');
    }
  }

  private async testConnection() {
    this.testConnectionButton.disabled = true;
    this.testConnectionButton.innerHTML = '<div class="loading"></div>Testing...';

    try {
      const response = await chrome.runtime.sendMessage({ type: 'TEST_CONNECTION' });
      if (response?.success) {
        this.showStatus('Connection successful! Mercury API is responding.', 'success');
      } else {
        this.showStatus('Connection failed. Check your API key.', 'error');
      }
    } catch (error: any) {
      this.showStatus('Connection failed: ' + error.message, 'error');
    }

    this.testConnectionButton.disabled = false;
    this.testConnectionButton.textContent = 'Test Connection';
  }

  private validateInputs(): boolean {
    const apiKey = this.apiKeyInput.value.trim();
    const valid = apiKey.startsWith('sk_') && apiKey.length > 10;
    this.apiKeyInput.style.borderColor = apiKey.length === 0 ? '#ddd' : (valid ? '#34a853' : '#f44336');
    this.saveButton.disabled = !valid;
    return valid;
  }

  private showStatus(message: string, type: 'success' | 'error') {
    this.statusDiv.textContent = message;
    this.statusDiv.className = `status ${type}`;
    this.statusDiv.style.display = 'block';
    if (type === 'success') setTimeout(() => { this.statusDiv.style.display = 'none'; }, 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => { new OptionsPage(); });
