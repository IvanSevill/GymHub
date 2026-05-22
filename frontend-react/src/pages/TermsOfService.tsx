import React from "react";
import { Link } from "react-router-dom";

const TermsOfService: React.FC = () => {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/login"
          className="text-sm text-neutral-400 hover:text-white mb-8 inline-block"
        >
          ← Back
        </Link>

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-neutral-400 text-sm mb-10">
          Last updated: May 22, 2026
        </p>

        <section className="space-y-8 text-neutral-300 leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using GymHub ("the Service"), you agree to be
              bound by these Terms of Service. If you do not agree, do not use
              the Service.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              2. Description of Service
            </h2>
            <p>
              GymHub is a personal fitness tracking platform that lets you log
              workouts, view analytics, and optionally sync data with Google
              Calendar and Fitbit. The Service is provided free of charge for
              personal, non-commercial use.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              3. User Accounts
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                You must sign in with a valid Google account. You are
                responsible for maintaining the security of your account.
              </li>
              <li>
                You agree not to use the Service for any unlawful purpose or in
                a way that could harm others.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              4. Third-Party Integrations
            </h2>
            <p>
              The Service integrates with Google Calendar and Fitbit. Your use
              of those integrations is also governed by Google's and Fitbit's
              own Terms of Service and Privacy Policies. GymHub is not
              affiliated with Google LLC or Fitbit, Inc.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              5. Data and Privacy
            </h2>
            <p>
              Your use of the Service is also governed by our{" "}
              <Link to="/privacy" className="text-blue-400 hover:underline">
                Privacy Policy
              </Link>
              , which is incorporated into these Terms by reference.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              6. Disclaimer of Warranties
            </h2>
            <p>
              The Service is provided "as is" without warranties of any kind,
              express or implied. We do not guarantee that the Service will be
              uninterrupted, error-free, or secure. Fitness data provided by the
              app is for informational purposes only and is not medical advice.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              7. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by law, GymHub and its developer
              shall not be liable for any indirect, incidental, or consequential
              damages arising from your use of the Service.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              8. Changes to Terms
            </h2>
            <p>
              We may update these Terms from time to time. Continued use of the
              Service after changes are posted constitutes acceptance of the
              updated Terms.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-3">
              9. Contact
            </h2>
            <p>
              Questions about these Terms? Contact us at:{" "}
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

export default TermsOfService;
