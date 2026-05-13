// Options page script
console.log('Cometeor options loaded');

interface CometeorSettings {
  projectId: string;
  region: string;
  model: string;
  clientId: string;
  enableMutationWatching: boolean;
  humanizedInput: boolean;
  maxTokens: number;
  temperature: number;
}

class OptionsPage {
  private projectIdInput: HTMLInputElement;
  private regionSelect: HTMLSelectElement;
  private modelSelect: HTMLSelectElement;
  private clientIdInput: HTMLInputElement;
  private mutationWatchingCheckbox: HTMLInputElement;
  private humanizedInputCheckbox: HTMLInputElement;
  private maxTokensInput: HTMLInputElement;
  private temperatureInput: HTMLInputElement;
  private saveButton: HTMLButtonElement;
  private statusDiv: HTMLElement;
  private testConnectionButton: HTMLButtonElement;

  constructor() {
    this.projectIdInput = document.getElementById('projectId') as HTMLInputElement;
    this.regionSelect = document.getElementById('region') as HTMLSelectElement;
    this.modelSelect = document.getElementById('model') as HTMLSelectElement;
    this.clientIdInput = document.getElementById('clientId') as HTMLInputElement;
    this.mutationWatchingCheckbox = document.getElementById('enableMutationWatching') as HTMLInputElement;
    this.humanizedInputCheckbox = document.getElementById('humanizedInput') as HTMLInputElement;
    this.maxTokensInput = document.getElementById('maxTokens') as HTMLInputElement;
    this.temperatureInput = document.getElementById('temperature') as HTMLInputElement;
    this.saveButton = document.getElementById('saveButton') as HTMLButtonElement;
    this.statusDiv = document.getElementById('status') as HTMLElement;
    this.testConnectionButton = document.getElementById('testConnectionButton') as HTMLButtonElement;

    this.initializeUI();
    this.loadSettings();
  }

  private initializeUI() {
    // Save button
    this.saveButton.addEventListener('click', () => this.saveSettings());

    // Test connection button
    this.testConnectionButton.addEventListener('click', () => this.testConnection());

    // Input validation
    this.projectIdInput.addEventListener('input', () => this.validateInputs());
    this.clientIdInput.addEventListener('input', () => this.validateInputs());
    this.maxTokensInput.addEventListener('input', () => this.validateInputs());
    this.temperatureInput.addEventListener('input', () => this.validateInputs());

    // Range input display
    this.temperatureInput.addEventListener('input', () => {
      this.updateRangeDisplay('temperatureValue', this.temperatureInput.value);
    });

    this.maxTokensInput.addEventListener('input', () => {
      this.updateRangeDisplay('maxTokensValue', this.maxTokensInput.value);
    });

    this.validateInputs();
  }

  private async loadSettings() {
    try {
      const settings = await this.getSettings();
      this.projectIdInput.value = settings.projectId || '';
      this.regionSelect.value = settings.region || 'us-central1';
      this.modelSelect.value = settings.model || 'gemini-2.0-flash-exp';
      this.clientIdInput.value = settings.clientId || '';
      this.mutationWatchingCheckbox.checked = settings.enableMutationWatching ?? true;
      this.humanizedInputCheckbox.checked = settings.humanizedInput ?? true;
      this.maxTokensInput.value = String(settings.maxTokens || 2048);
      this.temperatureInput.value = String(settings.temperature || 0.7);

      this.updateRangeDisplay('temperatureValue', this.temperatureInput.value);
      this.updateRangeDisplay('maxTokensValue', this.maxTokensInput.value);
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.showStatus('Failed to load settings', 'error');
    }
  }

  private async saveSettings() {
    if (!this.validateInputs()) return;

    const settings: CometeorSettings = {
      projectId: this.projectIdInput.value.trim(),
      region: this.regionSelect.value,
      model: this.modelSelect.value,
      clientId: this.clientIdInput.value.trim(),
      enableMutationWatching: this.mutationWatchingCheckbox.checked,
      humanizedInput: this.humanizedInputCheckbox.checked,
      maxTokens: parseInt(this.maxTokensInput.value),
      temperature: parseFloat(this.temperatureInput.value),
    };

    try {
      await chrome.storage.sync.set(settings);

      // Notify background script of config change
      chrome.runtime.sendMessage({ type: 'CONFIG_UPDATED', config: settings });

      this.showStatus('Settings saved successfully!', 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showStatus('Failed to save settings', 'error');
    }
  }

  private async testConnection() {
    this.setLoading(this.testConnectionButton, true);

    try {
      const response = await chrome.runtime.sendMessage({ type: 'TEST_CONNECTION' });
      if (response?.success) {
        this.showStatus('Connection test successful!', 'success');
      } else {
        this.showStatus('Connection test failed: ' + (response?.error || 'Unknown error'), 'error');
      }
    } catch (error: any) {
      this.showStatus('Connection test failed: ' + error.message, 'error');
    }

    this.setLoading(this.testConnectionButton, false);
  }

  private validateInputs(): boolean {
    let isValid = true;

    // Project ID validation
    if (!this.projectIdInput.value.trim()) {
      this.setInputError(this.projectIdInput, true);
      isValid = false;
    } else {
      this.setInputError(this.projectIdInput, false);
    }

    // Client ID validation
    if (!this.clientIdInput.value.trim()) {
      this.setInputError(this.clientIdInput, true);
      isValid = false;
    } else {
      this.setInputError(this.clientIdInput, false);
    }

    // Max tokens validation
    const maxTokens = parseInt(this.maxTokensInput.value);
    if (isNaN(maxTokens) || maxTokens < 100 || maxTokens > 8192) {
      this.setInputError(this.maxTokensInput, true);
      isValid = false;
    } else {
      this.setInputError(this.maxTokensInput, false);
    }

    // Temperature validation
    const temperature = parseFloat(this.temperatureInput.value);
    if (isNaN(temperature) || temperature < 0 || temperature > 2) {
      this.setInputError(this.temperatureInput, true);
      isValid = false;
    } else {
      this.setInputError(this.temperatureInput, false);
    }

    this.saveButton.disabled = !isValid;
    return isValid;
  }

  private setInputError(input: HTMLInputElement, hasError: boolean) {
    if (hasError) {
      input.style.borderColor = '#f44336';
    } else {
      input.style.borderColor = '#ddd';
    }
  }

  private updateRangeDisplay(elementId: string, value: string) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = value;
    }
  }

  private showStatus(message: string, type: 'success' | 'error') {
    this.statusDiv.textContent = message;
    this.statusDiv.className = `status ${type}`;
    this.statusDiv.style.display = 'block';

    if (type === 'success') {
      setTimeout(() => {
        this.statusDiv.style.display = 'none';
      }, 3000);
    }
  }

  private setLoading(button: HTMLButtonElement, loading: boolean) {
    button.disabled = loading;
    if (loading) {
      button.innerHTML = '<div class="loading"></div> Testing...';
    } else {
      button.textContent = 'Test Connection';
    }
  }

  private async getSettings(): Promise<Partial<CometeorSettings>> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(null, (result) => {
        resolve(result);
      });
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new OptionsPage();
});