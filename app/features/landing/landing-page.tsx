import { Link } from "react-router";

import { RidrMobileNav } from "~/features/shared/components/ridr-mobile-nav";
import { RidrTopNav } from "~/features/shared/components/ridr-top-nav";
import { MaterialSymbol } from "~/features/shared/components/material-symbol";

import "./landing-page.css";

const mapImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCB7lj27VZe_fC75_GjcF5fQsHhHdIRTwMw7WMsr_1NLtr-cnKd4E6FKhEj8JmNErAqMZp33AjLTVTu8yGJsYSrHH-TVmei9gG-7xSKpImb2g2erfwHB6eUj4vefk6dZfp-HRsmutpb8gr6aJyxt34_9t3kwaf9vJrhUHXBSf3WKMDVwk-sbndm8ZKmiVDOE2C6Pq_oTgBjILLD3TQ63B5_3Zmc4D8SrcPwx3jU82ftzlyHeyY0ASojAfxUaoZtb9XBYCBToFJZJ-6R";

const vehicleImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuA2ZeE8raFmK1qN5vQzkagFQXZoDQ7LUdc0d5nf28Fw-Uyg2MWpde1pHLUfS7z2YW8tuDS5h0GsUDDMQoDarYcBeXI5qdsY9L3x9ex2P_CFrtJnonbMTs0kNOwmUT_cCWAWhA6AbRA5MStl7HvkFPp1wxhaGrHVeRiu0ZlINzZQnkosPZgBI7AZuhCR-fY4Zo6IJriBKphavXuk-7Ady_EaqFtOtSiwoMGYJtKbfNAB02KVidA8dYd1su6zv6yazs-fK6Wclvaj4AzD";

const crowdOne =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuD7zyhIyrj1gflcWL9lOedgCciPCVVRVZAB2UJKtEP-EmbZx05oJPFWCQjsnJMITYQ7EVDilbD8VUu-Zurl9TO4cq1KyAY9CYdw7pbmn6zpi7CZof1-dbedn0oX-gmtVkdq8CgDKEbcHczzpemJ5ASMl_jA2vfapOS6bjpPrpI2Rko05EhCpgifrpkWtyYTVTLQy7Bvk3XSNKKCf4CP1htI9FMPlp5cGSbycwemDl52aMhWRuQrleBmtFbOuxZFb0UjtElehTR08sFo";

const crowdTwo =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDgh-ifjYJl19hk0SE92PJ_4WmTkKjxE67XPh0yargDkyDv7NQWxmYzl0Ge4oSu2mcwUiefgThW72lyJ4iTzmiX106w_mNETVUZFcddodQKd0ms6gojX-rtgL4O7pOGTxieQMje22fYtkonh8QNJYP0L_yYsaurdwIuPMT8tzx6pzwvjvr9Vz9qBzW0RitFVAHkm19TVwT62B8xaGQHVrBWjCKoSZpGB0s6RN7f_DL1eKreX1ge8C4vL15k5N8bIieg71bYnyVjeLND";

export function LandingPage() {
  return (
    <div className="landing-page">
      <RidrTopNav active="dashboard" showBookNow />

      <main className="landing-main">
        <section className="landing-hero" aria-label="Ridr booking hero">
          <img src={mapImage} alt="City map" className="landing-hero-map" />
          <div className="landing-hero-overlay" />
          <div className="landing-hero-fade" />

          <div className="landing-hero-content">
            <article className="landing-booking-card">
              <h1>Where to?</h1>

              <div className="landing-route-stack">
                <label>
                  <span>
                    <MaterialSymbol name="trip_origin" className="landing-input-icon" />
                    Current Location
                  </span>
                  <input type="text" value="Current Location" readOnly />
                </label>

                <label>
                  <span>
                    <MaterialSymbol name="location_on" className="landing-input-icon" />
                    Destination
                  </span>
                  <input type="text" placeholder="Enter destination" readOnly />
                </label>
              </div>

              <div className="landing-saved-grid">
                <button type="button">
                  <MaterialSymbol name="home" className="landing-saved-icon" />
                  <div>
                    <small>Home</small>
                    <strong>Sunset Blvd 102</strong>
                  </div>
                </button>
                <button type="button">
                  <MaterialSymbol name="work" className="landing-saved-icon" />
                  <div>
                    <small>Work</small>
                    <strong>Tech Plaza</strong>
                  </div>
                </button>
              </div>

              <div className="landing-card-actions">
                <Link to="/booking/fare-estimates" className="landing-primary-action">
                  Book a Ride
                </Link>
                <Link to="/ride/pre-meeting-chat" className="landing-secondary-action">
                  Share a Ride
                </Link>
              </div>
            </article>

            <aside className="landing-hero-copy">
              <h2>
                Move with
                <br />
                Purpose.
              </h2>
              <p>
                High-precision logistics meeting environmental stewardship.
                Premium rides, zero carbon guilt.
              </p>
            </aside>
          </div>
        </section>

        <section className="landing-impact" aria-labelledby="impact-heading">
          <header className="landing-impact-head">
            <div>
              <span>Sustainability Impact</span>
              <h3 id="impact-heading">Your footprint, reimagined.</h3>
            </div>
            <Link to="/impact/carbon-neutral" className="landing-impact-link">
              View Carbon Report
              <MaterialSymbol name="arrow_forward" className="landing-inline-icon" />
            </Link>
          </header>

          <div className="landing-impact-grid">
            <article className="landing-impact-card">
              <MaterialSymbol name="payments" className="landing-impact-icon" />
              <small>Annual Savings</small>
              <h4>Save $500/year</h4>
              <p>
                Based on your average commute. Efficient routing and shared rides
                optimize your wallet and the planet.
              </p>
            </article>

            <article className="landing-impact-card landing-impact-card-strong">
              <MaterialSymbol
                name="energy_savings_leaf"
                className="landing-impact-icon"
                filled
              />
              <small>Weekly Reduction</small>
              <h4>Prevent 66 lbs CO2/week</h4>
              <div className="landing-progress-track">
                <div className="landing-progress-fill" />
              </div>
              <p>75% of your monthly goal achieved</p>
            </article>

            <article className="landing-impact-card">
              <small>Collective Power</small>
              <h4>Together, we are reducing CO2 by 125 million metric tons.</h4>
              <div className="landing-crowd">
                <img src={crowdOne} alt="Community member" />
                <img src={crowdTwo} alt="Community member" />
                <span>+1M</span>
                <em>Join the movement</em>
              </div>
            </article>
          </div>
        </section>

        <section className="landing-feature" aria-label="Feature spotlight">
          <figure className="landing-feature-media">
            <img src={vehicleImage} alt="Electric vehicle interior" />
            <figcaption>
              <div>
                <MaterialSymbol name="electric_car" className="landing-inline-icon" />
                <strong>Ridr Premium</strong>
              </div>
              <p>100% of our premium fleet consists of zero-emission vehicles.</p>
            </figcaption>
          </figure>

          <article className="landing-feature-copy">
            <h3>Precision engineering meet environmental ethics.</h3>
            <ul>
              <li>
                <MaterialSymbol name="check" className="landing-list-icon" filled />
                <div>
                  <strong>Optimized Carbon Routing</strong>
                  <p>
                    AI-assisted route planning minimizes idle time and reduces
                    unnecessary emissions.
                  </p>
                </div>
              </li>
              <li>
                <MaterialSymbol name="check" className="landing-list-icon" filled />
                <div>
                  <strong>Verified Offsetting</strong>
                  <p>
                    Every ride is neutralized with independently verified
                    reforestation and clean-energy projects.
                  </p>
                </div>
              </li>
              <li>
                <MaterialSymbol name="check" className="landing-list-icon" filled />
                <div>
                  <strong>Sustainable Perks</strong>
                  <p>
                    Earn eco points on every shared route and redeem them with
                    local green partners.
                  </p>
                </div>
              </li>
            </ul>
          </article>
        </section>

        <footer className="landing-footer">
          <div className="landing-footer-brand">
            <strong>Ridr</strong>
            <p>
              Revolutionizing daily transit through technical precision and
              biological necessity.
            </p>
          </div>

          <div>
            <h5>Product</h5>
            <Link to="/booking/fare-estimates">Ride Types</Link>
            <Link to="/impact/carbon-neutral">Sustainability</Link>
          </div>

          <div>
            <h5>Company</h5>
            <a href="#">About Us</a>
            <a href="#">Careers</a>
          </div>

          <div>
            <h5>Support</h5>
            <a href="#">Help Center</a>
            <a href="#">Privacy Policy</a>
          </div>
        </footer>
      </main>

      <RidrMobileNav active="dashboard" />
    </div>
  );
}
