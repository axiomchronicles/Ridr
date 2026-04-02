import { useMemo, useState } from "react";

import { RidrMobileNav } from "~/features/shared/components/ridr-mobile-nav";
import { RidrTopNav } from "~/features/shared/components/ridr-top-nav";
import { MaterialSymbol } from "~/features/shared/components/material-symbol";

import "./pre-ride-meeting-chat-page.css";

type ChatMessage = {
  id: string;
  author: "driver" | "user" | "system";
  text: string;
  time?: string;
};

const initialMessages: ChatMessage[] = [
  {
    id: "sys-1",
    author: "system",
    text: "Elena is carbon-neutral certified",
  },
  {
    id: "d-1",
    author: "driver",
    text:
      "Hello! I have just reached the airport perimeter. I will be at Terminal 2, Door 4 in about 4 minutes.",
    time: "14:22 • Read",
  },
  {
    id: "u-1",
    author: "user",
    text:
      "Perfect! I am standing by pillar B4 and I have one large suitcase.",
    time: "14:24 • Delivered",
  },
  {
    id: "d-2",
    author: "driver",
    text: "Excellent. I see B4 zone. I am pulling in now!",
    time: "Just now",
  },
];

const quickReplies = [
  "Great, see you soon!",
  "I am wearing a blue hat",
  "I have two bags",
];

const driverAvatar =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCZfwX7uh9O_kaVPaFGKmRKF_43d-x-ljsyNnQ44Koz3-ZN7D_JYtZkLtn44Ln1tdq23fpv_XReY0JJP2znZb8EXqTN8UmjJVfLJb1oiTI_z-XRZiqvg1ArOwGf0wzDtC4O8nC6X6oDTrFC7TXOOSMF1SBam_EUxegYgox3xjJ9RSMe94YpYOzqCdWF0S1KuP0XZZ1uTdrvw4ZhA_mwtV_k2ScgR6vrsuiYfUX1W_d_zHWDKBUOdq7363KjP711Z2wWnRUrZmYgRidY";

const mapImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuC1RKftOEC1zqgqlSwilu2OONVXOySxsR6d8bKa45JGg2iWf2UOukTwf9wYXWmIH_YlMDuSAhedKfkNuRFmiYAZeABlKfxfzsWu-tm7JCLpdqNpbJBVTASpSarFnKeqWYSKAepFmjDzLfFRehfocfQ4iVqbxsA6zble-Rw68qe46ltt_wlDIppdbYu6crdIqhx1u4EJyTmry2dvxb3E2onjVGg5_8JjiIEmFtl30fd_Du74liwkp4ynfCNz1lkHGPSLX3q70cQrLPPH";

export function PreRideMeetingChatPage() {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");

  const canSend = useMemo(() => draft.trim().length > 0, [draft]);

  function sendMessage(text: string) {
    const value = text.trim();
    if (!value) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: `u-${current.length + 1}`,
        author: "user",
        text: value,
        time: "Now • Sent",
      },
    ]);
    setDraft("");
  }

  return (
    <div className="chat-page">
      <RidrTopNav active="history" />

      <main className="chat-main-layout">
        <aside className="chat-sidebar">
          <section className="chat-driver-card">
            <div className="chat-driver-head">
              <img src={driverAvatar} alt="Elena Rodriguez" />
              <div>
                <h1>Elena Rodriguez</h1>
                <p>★ 4.98 <span>(2.4k rides)</span></p>
                <small>
                  <MaterialSymbol name="eco" filled /> Verified Eco-Driver
                </small>
              </div>
            </div>

            <div className="chat-driver-meta">
              <div>
                <span>Vehicle</span>
                <strong>Tesla Model Y • Midnight Silver</strong>
              </div>
              <em>ECO-552-V</em>
            </div>

            <div className="chat-driver-stats">
              <article>
                <span>Arrival</span>
                <strong>4 mins</strong>
              </article>
              <article>
                <span>Impact</span>
                <strong>-1.2 kg CO2</strong>
              </article>
            </div>
          </section>

          <section className="chat-meeting-map">
            <div className="chat-map-figure">
              <img src={mapImage} alt="Meeting map" />
              <div>
                <MaterialSymbol name="location_on" className="chat-pin" />
                Terminal 2, Door 4
              </div>
            </div>
            <button type="button">
              <div>
                <span>Precise Meeting Spot</span>
                <strong>Passenger Pickup Zone B</strong>
              </div>
              <MaterialSymbol name="arrow_forward_ios" />
            </button>
          </section>

          <section className="chat-preferences">
            <h2>Meeting Preferences</h2>
            <div>
              <button type="button">
                <MaterialSymbol name="work" className="chat-pref-icon" />
                Large Luggage
              </button>
              <button type="button">
                <MaterialSymbol name="checkroom" className="chat-pref-icon" />
                Blue Jacket
              </button>
            </div>
          </section>
        </aside>

        <section className="chat-panel">
          <header className="chat-panel-header">
            <div>
              <span className="chat-online-dot" />
              <strong>Meeting Chat</strong>
            </div>
            <button type="button">
              <MaterialSymbol name="security" className="chat-safe-icon" />
              Safety
            </button>
          </header>

          <div className="chat-messages">
            {messages.map((message) => {
              if (message.author === "system") {
                return (
                  <p key={message.id} className="chat-system-pill">
                    {message.text}
                  </p>
                );
              }

              const isDriver = message.author === "driver";
              return (
                <div
                  key={message.id}
                  className={isDriver ? "chat-bubble-row" : "chat-bubble-row chat-bubble-row-user"}
                >
                  {isDriver ? <img src={driverAvatar} alt="Driver" /> : null}
                  <div>
                    <p className={isDriver ? "chat-bubble" : "chat-bubble chat-bubble-user"}>
                      {message.text}
                    </p>
                    {message.time ? <small>{message.time}</small> : null}
                  </div>
                </div>
              );
            })}

            <div className="chat-quick-replies">
              {quickReplies.map((reply) => (
                <button key={reply} type="button" onClick={() => sendMessage(reply)}>
                  {reply}
                </button>
              ))}
            </div>

            <article className="chat-info-card">
              <MaterialSymbol name="luggage" className="chat-info-icon" />
              <div>
                <strong>Luggage space prepared</strong>
                <p>Elena has cleared the trunk for your large suitcase.</p>
              </div>
            </article>
          </div>

          <footer className="chat-input-row">
            <button type="button" aria-label="Add attachment">
              <MaterialSymbol name="add_circle" />
            </button>
            <input
              type="text"
              value={draft}
              placeholder="Type your message..."
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  sendMessage(draft);
                }
              }}
            />
            <button
              type="button"
              aria-label="Send message"
              onClick={() => sendMessage(draft)}
              disabled={!canSend}
            >
              <MaterialSymbol name="send" filled />
            </button>
          </footer>
        </section>
      </main>

      <RidrMobileNav active="ride" />
    </div>
  );
}
