import React from "react";
import { Link } from "react-router-dom";

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/login"
          className="text-sm text-neutral-400 hover:text-white mb-8 inline-block"
        >
          ← Back
        </Link>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-neutral-400 text-sm mb-10">
          Last updated: May 22, 2026
        </p>

        <section className="space-y-8 text-neutral-300 leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              1. Introduction
            </h2>
            <p>
              GymHub ("we", "our", or "us") is a personal fitness platform that
              helps you track workouts, plan routines, and visualise training
              analytics. This Privacy Policy explains what data we collect, how
              we use it, and the choices you have.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              2. Data We Collect
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong className="text-white">
                  Google account information
                </strong>{" "}
                — your name and email address, obtained via Google Sign-In.
              </li>
              <li>
                <strong className="text-white">Google Calendar data</strong> —
                events from the calendar you select during setup, used solely to
                import and display your workout history inside GymHub.
              </li>
              <li>
                <strong className="text-white">Fitbit activity data</strong>{" "}
                (optional) — steps, heart rate, and sleep metrics if you connect
                your Fitbit account.
              </li>
              <li>
                <strong className="text-white">Workout records</strong> —
                exercises, sets, reps, and weights you log directly in the app.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              3. How We Use Your Data
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                To provide core app features: workout tracking, analytics, and
                calendar sync.
              </li>
              <li>To authenticate you securely using Google OAuth 2.0.</li>
              <li>
                We do not sell, rent, or share your data with third parties for
                advertising.
              </li>
              <li>
                We do not use your Google Calendar or Fitbit data for any
                purpose beyond displaying it to you inside GymHub.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              4. Data Storage and Security
            </h2>
            <p>
              Your data is stored in a secured database hosted on Render
              (render.com). OAuth tokens are stored encrypted and are only used
              to fetch your data from Google and Fitbit on your behalf. We apply
              industry-standard security practices to protect your information.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              5. Google API Services User Data Policy
            </h2>
            <p>
              GymHub's use of information received from Google APIs adheres to
              the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. We only access the
              Google Calendar data that is strictly necessary to provide the
              workout-tracking features you requested.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              6. Your Rights
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                You can disconnect your Google or Fitbit account at any time
                from the Settings page.
              </li>
              <li>
                You can request deletion of all your data by contacting us at
                the email below.
              </li>
              <li>
                You can revoke GymHub's access to your Google account at any
                time via{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  Google Account Permissions
                </a>
                .
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              7. Data Retention
            </h2>
            <p>
              We retain your data for as long as your account is active. If you
              delete your account, all associated data is removed from our
              servers within 30 days.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              8. Contact
            </h2>
            <p>
              For any privacy-related questions or data deletion requests,
              contact us at:{" "}
              <a
                href="mailto:ivansevillano2005@gmail.com"
                className="text-blue-400 hover:underline"
              >
                ivansevillano2005@gmail.com
              </a>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
