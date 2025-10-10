// Simple script to check duplicate customers
// Run with: node check-customers.js

import dotenv from 'dotenv';
import Stripe from 'stripe';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

async function checkCustomers() {
  try {
    console.log('🔍 Checking Stripe customers...\n');

    // Get all customers from Stripe
    let allCustomers = [];
    let hasMore = true;
    let startingAfter = undefined;

    while (hasMore) {
      const customers = await stripe.customers.list({
        limit: 100,
        ...(startingAfter && { starting_after: startingAfter })
      });
      
      allCustomers = allCustomers.concat(customers.data);
      hasMore = customers.has_more;
      startingAfter = customers.data[customers.data.length - 1]?.id;
    }

    console.log(`📊 Total customers in Stripe: ${allCustomers.length}\n`);

    // Group customers by email
    const customersByEmail = {};
    allCustomers.forEach(customer => {
      if (customer.email) {
        if (!customersByEmail[customer.email]) {
          customersByEmail[customer.email] = [];
        }
        customersByEmail[customer.email].push(customer);
      }
    });

    // Show duplicates
    const duplicates = {};
    Object.keys(customersByEmail).forEach(email => {
      if (customersByEmail[email].length > 1) {
        duplicates[email] = customersByEmail[email];
      }
    });

    if (Object.keys(duplicates).length === 0) {
      console.log('✅ No duplicate customers found!');
    } else {
      console.log(`⚠️  Found ${Object.keys(duplicates).length} emails with duplicate customers:\n`);
      
      for (const [email, customers] of Object.entries(duplicates)) {
        console.log(`📧 ${email}:`);
        customers.forEach((customer, index) => {
          const created = new Date(customer.created * 1000).toLocaleString();
          console.log(`  ${index + 1}. ID: ${customer.id} | Created: ${created}`);
        });
        console.log('');
      }
    }

    // Show unique customers
    const uniqueEmails = Object.keys(customersByEmail).filter(email => customersByEmail[email].length === 1);
    console.log(`✅ Unique customers: ${uniqueEmails.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkCustomers();
