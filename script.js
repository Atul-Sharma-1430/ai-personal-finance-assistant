document.addEventListener("DOMContentLoaded", () => {
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const clearBtn = document.getElementById("clear-btn");
  const newChatBtn = document.getElementById("new-chat-btn");
  const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
  const sidebar = document.getElementById("sidebar");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const recentChatsList = document.getElementById("recent-chats-list");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const themeIcon = document.getElementById("theme-icon");
  const themeText = document.getElementById("theme-text");
  const chatBody = document.getElementById("chat-body");
  const messagesContainer = document.getElementById("messages-container");
  const typingIndicator = document.getElementById("typing-indicator");
  const welcomeCard = document.getElementById("welcome-card");
  const chipBtns = document.querySelectorAll(".chip-btn");

  // Store active chat state & history
  let conversationHistory = [];
  let activeChatId = null;
  let currentUiMessages = [];

  // Load saved chats from localStorage
  let savedChats = JSON.parse(localStorage.getItem("finance_chats") || "[]");

  // SVG icons for Theme Toggle
  const sunIcon = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
  const moonIcon = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;

  // Theme Setup (Default to dark)
  let currentTheme = localStorage.getItem("theme") || "dark";
  applyTheme(currentTheme);

  themeToggleBtn.addEventListener("click", () => {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(currentTheme);
    localStorage.setItem("theme", currentTheme);
  });

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
    // Also set on the main app container so all child elements get CSS variables
    const appLayout = document.querySelector(".app-layout");
    if (appLayout) appLayout.setAttribute("data-theme", theme);
    if (theme === "dark") {
      themeIcon.innerHTML = sunIcon;
      themeText.textContent = "Light Mode";
    } else {
      themeIcon.innerHTML = moonIcon;
      themeText.textContent = "Dark Mode";
    }
  }

  // Sidebar Toggle
  function isMobile() {
    return window.innerWidth <= 768;
  }

  function openSidebar() {
    sidebar.classList.remove("hidden");
    if (isMobile() && sidebarBackdrop) {
      sidebarBackdrop.classList.add("visible");
    }
  }

  function closeSidebar() {
    sidebar.classList.add("hidden");
    if (sidebarBackdrop) {
      sidebarBackdrop.classList.remove("visible");
    }
  }

  function toggleSidebar() {
    if (sidebar.classList.contains("hidden")) {
      openSidebar();
    } else {
      closeSidebar();
    }
  }

  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener("click", toggleSidebar);
  }

  // Tap backdrop to close sidebar on mobile
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", closeSidebar);
  }

  // Render Recent Chats on Startup
  renderRecentChats();

  // + New Chat Button
  newChatBtn.addEventListener("click", startNewChat);

  function startNewChat() {
    activeChatId = null;
    conversationHistory = [];
    currentUiMessages = [];
    messagesContainer.innerHTML = "";
    welcomeCard.style.display = "block";
    typingIndicator.style.display = "none";
    userInput.value = "";
    userInput.style.height = "auto";
    toggleSendButton();
    renderRecentChats();
    chatBody.scrollTop = 0;
  }

  // Clear Active Chat Button
  clearBtn.addEventListener("click", () => {
    if (activeChatId) {
      deleteChat(activeChatId);
    } else {
      startNewChat();
    }
  });

  // Auto resize text area
  userInput.addEventListener("input", () => {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 140) + "px";
    toggleSendButton();
  });

  function toggleSendButton() {
    const text = userInput.value.trim();
    sendBtn.disabled = text.length === 0;
  }

  // Handle Enter keypress (Shift+Enter for newline)
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) {
        sendMessage();
      }
    }
  });

  // Handle suggestion prompt pills
  chipBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const query = btn.getAttribute("data-query");
      if (query) {
        userInput.value = query;
        userInput.style.height = "auto";
        toggleSendButton();
        sendMessage();
      }
    });
  });

  sendBtn.addEventListener("click", sendMessage);

  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    // Hide welcome card on first message
    if (welcomeCard) {
      welcomeCard.style.display = "none";
    }

    // Display user message in UI
    appendMessage("user", text);
    currentUiMessages.push({ sender: "user", content: text });

    // Reset input field
    userInput.value = "";
    userInput.style.height = "auto";
    toggleSendButton();

    // Show loading indicator
    showLoading(true);
    scrollToBottom();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          history: conversationHistory,
        }),
      });

      const data = await response.json();
      showLoading(false);

      if (response.ok && data.response) {
        // Add user message & AI response to history
        conversationHistory.push({ role: "user", content: text });
        conversationHistory.push({ role: "model", content: data.response });

        currentUiMessages.push({ sender: "ai", content: data.response });
        appendMessage("ai", data.response);

        // Save or update chat session in recent chats
        saveCurrentChatSession(text);
      } else {
        const errorMsg =
          data.error || "An error occurred while reaching the AI assistant.";
        appendMessage("ai", `⚠️ ${errorMsg}`, true);
      }
    } catch (err) {
      showLoading(false);
      console.error("Chat error:", err);
      appendMessage(
        "ai",
        "⚠️ Network error: Unable to connect to backend server. Make sure Flask app is running.",
        true,
      );
    }

    scrollToBottom();
  }

  function appendMessage(sender, content, isError = false) {
    const row = document.createElement("div");
    row.className = `message-row ${sender}-row`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";

    if (sender === "user") {
      avatar.textContent = "U";
    } else {
      // Finance Trend Chart SVG Logo Icon
      avatar.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`;
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (isError) {
      bubble.style.borderColor = "#ef4444";
      bubble.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
    }

    if (sender === "ai") {
      bubble.innerHTML = formatMarkdown(content);
    } else {
      bubble.textContent = content;
    }

    row.appendChild(avatar);
    row.appendChild(bubble);
    messagesContainer.appendChild(row);
  }

  // Save or update current chat session in localStorage
  function saveCurrentChatSession(firstMessageText) {
    if (!activeChatId) {
      activeChatId = "chat_" + Date.now();
    }

    let chatTitle = firstMessageText;
    if (chatTitle.length > 30) {
      chatTitle = chatTitle.substring(0, 30) + "...";
    }

    let chatObj = savedChats.find((c) => c.id === activeChatId);
    if (!chatObj) {
      chatObj = {
        id: activeChatId,
        title: chatTitle,
        timestamp: Date.now(),
        history: [...conversationHistory],
        uiMessages: [...currentUiMessages],
      };
      savedChats.unshift(chatObj);
    } else {
      chatObj.history = [...conversationHistory];
      chatObj.uiMessages = [...currentUiMessages];
      chatObj.timestamp = Date.now();
    }

    localStorage.setItem("finance_chats", JSON.stringify(savedChats));
    renderRecentChats();
  }

  // Load a saved chat from Recent Chats
  function loadChatSession(chatId) {
    const chatObj = savedChats.find((c) => c.id === chatId);
    if (!chatObj) return;

    activeChatId = chatObj.id;
    conversationHistory = [...(chatObj.history || [])];
    currentUiMessages = [...(chatObj.uiMessages || [])];

    messagesContainer.innerHTML = "";
    welcomeCard.style.display = "none";

    currentUiMessages.forEach((msg) => {
      appendMessage(msg.sender, msg.content);
    });

    renderRecentChats();
    scrollToBottom();
  }

  // Delete a chat session
  function deleteChat(chatId) {
    savedChats = savedChats.filter((c) => c.id !== chatId);
    localStorage.setItem("finance_chats", JSON.stringify(savedChats));

    if (activeChatId === chatId) {
      startNewChat();
    } else {
      renderRecentChats();
    }
  }

  // Render Recent Chats List in Sidebar
  function renderRecentChats() {
    recentChatsList.innerHTML = "";

    if (savedChats.length === 0) {
      recentChatsList.innerHTML = `<div class="no-recent-chats">No recent chats yet</div>`;
      return;
    }

    savedChats.forEach((chat) => {
      const item = document.createElement("div");
      item.className = `recent-chat-item ${chat.id === activeChatId ? "active" : ""}`;

      const titleSpan = document.createElement("span");
      titleSpan.className = "recent-chat-title";
      titleSpan.textContent = chat.title || "Financial Query";
      titleSpan.addEventListener("click", () => {
        loadChatSession(chat.id);
        // On mobile, close the sidebar after selecting a chat
        if (isMobile()) closeSidebar();
      });

      const delBtn = document.createElement("button");
      delBtn.className = "delete-chat-btn";
      delBtn.title = "Delete Chat";
      delBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteChat(chat.id);
      });

      item.appendChild(titleSpan);
      item.appendChild(delBtn);
      recentChatsList.appendChild(item);
    });
  }

  function showLoading(show) {
    typingIndicator.style.display = show ? "flex" : "none";
    if (show) {
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  // Basic markdown formatter for neat rendering of bold text, bullet lists, and paragraphs
  function formatMarkdown(text) {
    if (!text) return "";

    // Escape HTML tags to prevent XSS
    let safeText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Bold **text** or __text__
    safeText = safeText.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    safeText = safeText.replace(/__(.*?)__/g, "<strong>$1</strong>");

    // Split into lines to format lists & paragraphs
    const lines = safeText.split("\n");
    let formattedHtml = "";
    let inList = false;

    lines.forEach((line) => {
      const trimmed = line.trim();
      // Match bullet points like "* ", "- ", "• "
      if (/^[\*\-\•]\s+/.test(trimmed)) {
        if (!inList) {
          formattedHtml += "<ul>";
          inList = true;
        }
        const itemContent = trimmed.replace(/^[\*\-\•]\s+/, "");
        formattedHtml += `<li>${itemContent}</li>`;
      }
      // Match numbered lists like "1. ", "2. "
      else if (/^\d+\.\s+/.test(trimmed)) {
        if (!inList) {
          formattedHtml += "<ol>";
          inList = true;
        }
        const itemContent = trimmed.replace(/^\d+\.\s+/, "");
        formattedHtml += `<li>${itemContent}</li>`;
      } else {
        if (inList) {
          formattedHtml += "</ul>";
          inList = false;
        }
        if (trimmed.length > 0) {
          formattedHtml += `<p>${trimmed}</p>`;
        }
      }
    });

    if (inList) {
      formattedHtml += "</ul>";
    }

    return formattedHtml;
  }
});
