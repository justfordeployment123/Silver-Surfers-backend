// Utility script to clean up duplicate Stripe customers
// Run with: node cleanup-duplicate-customers.js

import dotenv from 'dotenv';
import Stripe from 'stripe';
import { connectDB } from './my-app/services/server/db.js';
import User from './my-app/services/server/models/User.js';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

async function cleanupDuplicateCustomers() {
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('Connected to MongoDB');

    // Get all customers from Stripe
    console.log('Fetching all Stripe customers...');
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

    console.log(`Found ${allCustomers.length} total customers in Stripe`);

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

    // Find duplicates
    const duplicates = {};
    Object.keys(customersByEmail).forEach(email => {
      if (customersByEmail[email].length > 1) {
        duplicates[email] = customersByEmail[email];
      }
    });

    console.log(`\nFound ${Object.keys(duplicates).length} emails with duplicate customers:`);
    
    for (const [email, customers] of Object.entries(duplicates)) {
      console.log(`\n📧 ${email} (${customers.length} customers):`);
      
      // Sort by creation date (keep the oldest one)
      customers.sort((a, b) => new Date(a.created * 1000) - new Date(b.created * 1000));
      
      const keepCustomer = customers[0]; // Keep the first (oldest) customer
      const deleteCustomers = customers.slice(1); // Delete the rest
      
      console.log(`  ✅ Keep: ${keepCustomer.id} (created: ${new Date(keepCustomer.created * 1000).toISOString()})`);
      
      // Check if user exists in our database
      const user = await User.findOne({ email: email });
      if (user) {
        if (user.stripeCustomerId === keepCustomer.id) {
          console.log(`  ✅ User already linked to correct customer`);
        } else {
          console.log(`  🔄 Updating user stripeCustomerId from ${user.stripeCustomerId} to ${keepCustomer.id}`);
          await User.findByIdAndUpdate(user._id, { stripeCustomerId: keepCustomer.id });
        }
      } else {
        console.log(`  ⚠️  No user found in database for email: ${email}`);
      }
      
      // Delete duplicate customers (commented out for safety - uncomment to actually delete)
      for (const customer of deleteCustomers) {
        console.log(`  🗑️  Would delete: ${customer.id} (created: ${new Date(customer.created * 1000).toISOString()})`);
        // Uncomment the next line to actually delete the duplicate customers
        // await stripe.customers.del(customer.id);
      }
    }

    console.log('\n✅ Cleanup analysis complete!');
    console.log('💡 To actually delete duplicate customers, uncomment the deletion line in the script and run again.');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

// Helper function to get path resolution (since we're not in ES module context)
import path from 'path';

cleanupDuplicateCustomers();
