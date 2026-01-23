import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { Card, CardContent } from '../components/ui';
import './Legal.css';

export const TermsOfService: React.FC = () => {
    return (
        <div className="legal-page">
            <motion.div
                className="page-header"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="legal-icon">
                    <FileText size={32} />
                </div>
                <h1 className="page-title">Terms of Service</h1>
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
                                <h2>1. Acceptance of Terms</h2>
                                <p>By accessing and using SocialUp ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>
                            </section>

                            <section>
                                <h2>2. Description of Service</h2>
                                <p>SocialUp is a content management and distribution platform that helps creators manage, schedule, and publish content across multiple social media platforms, including TikTok. The Service provides tools for:</p>
                                <ul>
                                    <li>Video content management and organization</li>
                                    <li>Automated content distribution to connected social accounts</li>
                                    <li>Content scheduling and queue management</li>
                                    <li>Analytics and performance tracking</li>
                                    <li>AI-powered content optimization</li>
                                </ul>
                            </section>

                            <section>
                                <h2>3. User Accounts</h2>
                                <p>To use certain features of the Service, you must create an account. You are responsible for:</p>
                                <ul>
                                    <li>Maintaining the confidentiality of your account credentials</li>
                                    <li>All activities that occur under your account</li>
                                    <li>Ensuring your account information is accurate and up-to-date</li>
                                </ul>
                            </section>

                            <section>
                                <h2>4. Connected Social Media Accounts</h2>
                                <p>When you connect third-party social media accounts (such as TikTok) to ContentHub:</p>
                                <ul>
                                    <li>You authorize us to access and post content on your behalf</li>
                                    <li>You remain responsible for all content published through the Service</li>
                                    <li>You must comply with the terms of service of each connected platform</li>
                                    <li>You can disconnect accounts at any time through your settings</li>
                                </ul>
                            </section>

                            <section>
                                <h2>5. Content Guidelines</h2>
                                <p>You agree not to use the Service to publish content that:</p>
                                <ul>
                                    <li>Violates any applicable laws or regulations</li>
                                    <li>Infringes on intellectual property rights</li>
                                    <li>Contains harmful, threatening, or harassing material</li>
                                    <li>Spreads misinformation or spam</li>
                                    <li>Violates the terms of connected social platforms</li>
                                </ul>
                            </section>

                            <section>
                                <h2>6. Intellectual Property</h2>
                                <p>You retain all rights to your content. By using the Service, you grant us a limited license to process, store, and distribute your content as necessary to provide the Service.</p>
                            </section>

                            <section>
                                <h2>7. Limitation of Liability</h2>
                                <p>ContentHub is provided "as is" without warranties of any kind. We are not liable for any damages arising from your use of the Service, including but not limited to issues with third-party platform integrations.</p>
                            </section>

                            <section>
                                <h2>8. Changes to Terms</h2>
                                <p>We reserve the right to modify these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>
                            </section>

                            <section>
                                <h2>9. Contact</h2>
                                <p>For questions about these Terms of Service, please contact us at: <a href="mailto:support@socialup.app">support@socialup.app</a></p>
                            </section>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default TermsOfService;
