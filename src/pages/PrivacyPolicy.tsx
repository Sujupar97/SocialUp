import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import { Card, CardContent } from '../components/ui';
import './Legal.css';

export const PrivacyPolicy: React.FC = () => {
    return (
        <div className="legal-page">
            <motion.div
                className="page-header"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="legal-icon">
                    <Shield size={32} />
                </div>
                <h1 className="page-title">Privacy Policy</h1>
                <p className="page-subtitle">Last updated: January 2026</p>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <Card>
                    <CardContent>
                        <div className="legal-content">
                            <section>
                                <h2>1. Introduction</h2>
                                <p>SocialUp ("we", "our", or "us") respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, and safeguard your information when you use our content management platform.</p>
                            </section>

                            <section>
                                <h2>2. Information We Collect</h2>
                                <h3>2.1 Account Information</h3>
                                <p>When you create an account, we collect:</p>
                                <ul>
                                    <li>Email address</li>
                                    <li>Name (optional)</li>
                                    <li>Profile picture (optional)</li>
                                </ul>

                                <h3>2.2 Connected Social Media Accounts</h3>
                                <p>When you connect social media accounts (e.g., TikTok), we receive:</p>
                                <ul>
                                    <li>Account identifiers and access tokens</li>
                                    <li>Public profile information</li>
                                    <li>Content publishing permissions</li>
                                </ul>

                                <h3>2.3 Content Data</h3>
                                <p>We process:</p>
                                <ul>
                                    <li>Videos and media you upload for distribution</li>
                                    <li>Captions, descriptions, and hashtags</li>
                                    <li>Scheduling preferences</li>
                                </ul>

                                <h3>2.4 Usage Data</h3>
                                <p>We automatically collect:</p>
                                <ul>
                                    <li>Log data and analytics</li>
                                    <li>Device and browser information</li>
                                    <li>Feature usage patterns</li>
                                </ul>
                            </section>

                            <section>
                                <h2>3. How We Use Your Information</h2>
                                <p>We use your information to:</p>
                                <ul>
                                    <li>Provide and maintain the Service</li>
                                    <li>Publish content to your connected social accounts</li>
                                    <li>Generate analytics and insights</li>
                                    <li>Improve our platform and user experience</li>
                                    <li>Communicate service updates</li>
                                    <li>Ensure security and prevent fraud</li>
                                </ul>
                            </section>

                            <section>
                                <h2>4. Data Sharing</h2>
                                <p>We do not sell your personal data. We share data only:</p>
                                <ul>
                                    <li>With connected social platforms (to publish your content)</li>
                                    <li>With service providers who assist our operations</li>
                                    <li>When required by law or legal process</li>
                                    <li>With your explicit consent</li>
                                </ul>
                            </section>

                            <section>
                                <h2>5. Data Security</h2>
                                <p>We implement industry-standard security measures:</p>
                                <ul>
                                    <li>Encrypted data transmission (HTTPS/TLS)</li>
                                    <li>Secure credential storage</li>
                                    <li>Regular security audits</li>
                                    <li>Access controls and monitoring</li>
                                </ul>
                            </section>

                            <section>
                                <h2>6. Your Rights</h2>
                                <p>You have the right to:</p>
                                <ul>
                                    <li>Access your personal data</li>
                                    <li>Correct inaccurate information</li>
                                    <li>Delete your account and data</li>
                                    <li>Disconnect social media accounts</li>
                                    <li>Export your data</li>
                                    <li>Opt out of communications</li>
                                </ul>
                            </section>

                            <section>
                                <h2>7. Data Retention</h2>
                                <p>We retain your data while your account is active. Upon account deletion, we remove your personal data within 30 days, except where retention is required by law.</p>
                            </section>

                            <section>
                                <h2>8. Third-Party Services</h2>
                                <p>Our Service integrates with third-party platforms (e.g., TikTok). Your use of these integrations is also subject to their respective privacy policies.</p>
                            </section>

                            <section>
                                <h2>9. Children's Privacy</h2>
                                <p>ContentHub is not intended for users under 13 years of age. We do not knowingly collect data from children.</p>
                            </section>

                            <section>
                                <h2>10. Changes to This Policy</h2>
                                <p>We may update this Privacy Policy periodically. We will notify you of significant changes via email or through the Service.</p>
                            </section>

                            <section>
                                <h2>11. Contact Us</h2>
                                <p>For privacy-related inquiries, contact us at: <a href="mailto:privacy@socialup.app">privacy@socialup.app</a></p>
                            </section>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default PrivacyPolicy;
