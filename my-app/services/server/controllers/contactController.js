import ContactMessage from '../models/ContactMessage.js';

export async function submitContact(req, res) {
  try {
    const { name, email, subject, message } = req.body || {};
    if (!message || typeof message !== 'string' || message.trim().length < 5) {
      return res.status(400).json({ error: 'Message is required (min 5 chars).' });
    }
    
    const doc = await ContactMessage.create({
      name: typeof name === 'string' ? name.trim() : '',
      email: typeof email === 'string' ? email.trim() : '',
      subject: typeof subject === 'string' ? subject.trim() : '',
      message: message.trim(),
    });

    // Send email notification to info@mg.silversurfers.ai
    try {
      const { sendBasicEmail } = await import('../email.js');
      
      const emailSubject = `New Contact Form Message${subject ? `: ${subject}` : ''}`;
      const emailText = `
New contact form submission received:

Name: ${doc.name || 'Not provided'}
Email: ${doc.email || 'Not provided'}
Subject: ${doc.subject || 'Not provided'}

Message:
${doc.message}

---
Submitted at: ${new Date().toISOString()}
Message ID: ${doc._id}
      `.trim();

      const emailResult = await sendBasicEmail({
        to: 'info@mg.silversurfers.ai',
        subject: emailSubject,
        text: emailText
      });

      if (emailResult.success) {
        console.log('✅ Contact form email notification sent to info@mg.silversurfers.ai');
      } else {
        console.warn('⚠️ Failed to send contact form email notification:', emailResult.error);
      }
    } catch (emailError) {
      console.error('❌ Error sending contact form email notification:', emailError);
      // Don't fail the contact form submission if email fails
    }

    res.status(201).json({ success: true, item: doc });
  } catch (err) {
    console.error('Contact submit error:', err?.message || err);
    res.status(500).json({ error: 'Failed to submit message' });
  }
}



