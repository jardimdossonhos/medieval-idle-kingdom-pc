export class GodModeConsole {
  private clickCount = 0;
  private lastClickTime = 0;
  private isVisible = false;
  private panelElement: HTMLElement | null = null;
  private readonly CLICKS_REQUIRED = 5;
  private readonly CLICK_TIMEOUT_MS = 500; // Tempo máximo entre cliques

  constructor(
    private triggerElement: HTMLElement,
    private onCommand: (command: string) => void
  ) {
    this.setupTrigger();
  }

  private setupTrigger(): void {
    // Dá uma leve pista visual ao desenvolvedor (mouse pointer)
    this.triggerElement.style.cursor = "pointer";
    this.triggerElement.title = "v0.1.0"; 

    this.triggerElement.addEventListener("click", () => {
      const now = Date.now();
      // Zera o contador se a pessoa demorar muito entre um clique e outro
      if (now - this.lastClickTime > this.CLICK_TIMEOUT_MS) {
        this.clickCount = 0;
      }
      
      this.clickCount++;
      this.lastClickTime = now;

      if (this.clickCount >= this.CLICKS_REQUIRED) {
        this.clickCount = 0;
        this.togglePanel();
      }
    });
  }

  private togglePanel(): void {
    this.isVisible = !this.isVisible;
    if (this.isVisible) {
      this.render();
    } else if (this.panelElement) {
      this.panelElement.remove();
      this.panelElement = null;
    }
  }

  private render(): void {
    if (this.panelElement) return;

    this.panelElement = document.createElement("div");
    this.panelElement.id = "god-mode-console";
    this.panelElement.style.cssText = `
      position: absolute;
      top: 60px;
      right: 20px;
      width: 400px;
      background: rgba(10, 15, 20, 0.95);
      color: #00ff00;
      border: 1px solid #00ff00;
      font-family: 'Courier New', Courier, monospace;
      z-index: 9999;
      padding: 15px;
      border-radius: 4px;
      box-shadow: 0 0 20px rgba(0, 255, 0, 0.15);
      backdrop-filter: blur(5px);
    `;

    this.panelElement.innerHTML = `
      <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #00ff00; padding-bottom: 10px; margin-bottom: 15px;">
        <h3 style="margin: 0; font-size: 16px; text-shadow: 0 0 5px #00ff00;">👁️ CONSOLE DEV</h3>
        <button id="god-mode-close" style="background: none; border: none; color: #00ff00; cursor: pointer; font-weight: bold; font-size: 16px;">X</button>
      </div>
      
      <div id="god-mode-tabs" style="display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 1px dashed #333; padding-bottom: 10px;">
        <button class="god-tab" data-target="god-tab-resources" style="background: #00ff00; color: #000; border: none; padding: 5px 10px; cursor: pointer; font-weight: bold;">Recursos</button>
        <button class="god-tab" data-target="god-tab-tech" style="background: transparent; color: #00ff00; border: 1px solid #00ff00; padding: 5px 10px; cursor: pointer;">Tecnologia</button>
      </div>
      
      <div id="god-tab-resources" class="god-tab-content">
        <p style="margin-top: 0; font-size: 14px;"><strong>Tesouraria & Economia:</strong></p>
        <button id="btn-gold-10k" style="background: #222; color: #00ff00; border: 1px solid #00ff00; padding: 5px; cursor: pointer; margin-right: 5px; margin-bottom: 5px;">+10k Ouro</button>
        <button id="btn-food-10k" style="background: #222; color: #00ff00; border: 1px solid #00ff00; padding: 5px; cursor: pointer; margin-right: 5px; margin-bottom: 5px;">+10k Comida</button>
        <button id="btn-ruin-economy" style="background: #200; color: #ff3333; border: 1px solid #ff3333; padding: 5px; cursor: pointer; margin-top: 10px; width: 100%;">Apocalipse (Zerar Recursos)</button>
      </div>

      <div id="god-tab-tech" class="god-tab-content" style="display: none;">
        <p style="margin-top: 0; font-size: 14px;"><strong>Árvore do Conhecimento:</strong></p>
        <button id="btn-unlock-all-tech" style="background: #222; color: #00ff00; border: 1px solid #00ff00; padding: 5px; cursor: pointer; width: 100%;">Desbloquear Tecnologias Atuais</button>
      </div>
    `;

    document.body.appendChild(this.panelElement);
    this.setupInteractions();
  }

  private setupInteractions(): void {
    if (!this.panelElement) return;

    this.panelElement.querySelector("#god-mode-close")?.addEventListener("click", () => this.togglePanel());

    const tabs = this.panelElement.querySelectorAll(".god-tab");
    const contents = this.panelElement.querySelectorAll(".god-tab-content");

    tabs.forEach(tab => {
      tab.addEventListener("click", (e) => {
        const targetId = (e.target as HTMLElement).getAttribute("data-target");
        tabs.forEach(t => { (t as HTMLElement).style.background = "transparent"; (t as HTMLElement).style.color = "#00ff00"; });
        contents.forEach(c => (c as HTMLElement).style.display = "none");
        
        (e.target as HTMLElement).style.background = "#00ff00";
        (e.target as HTMLElement).style.color = "#000";
        const targetContent = this.panelElement!.querySelector(`#${targetId}`) as HTMLElement;
        if (targetContent) targetContent.style.display = "block";
      });
    });

    this.panelElement.querySelector("#btn-gold-10k")?.addEventListener("click", () => this.onCommand("gold_10k"));
    this.panelElement.querySelector("#btn-food-10k")?.addEventListener("click", () => this.onCommand("food_10k"));
    this.panelElement.querySelector("#btn-ruin-economy")?.addEventListener("click", () => this.onCommand("ruin_economy"));
    this.panelElement.querySelector("#btn-unlock-all-tech")?.addEventListener("click", () => this.onCommand("unlock_tech"));
  }
}