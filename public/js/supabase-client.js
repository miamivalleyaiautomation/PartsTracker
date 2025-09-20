// js/supabase-client.js
// Supabase client and database operations for Parts Assistant

import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_CONFIG } from './config.js';
import { normalizeCode, chunk, createStoragePath } from './utils.js';

// Initialize Supabase client
const { createClient } = supabase;
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Jobs Operations
 */
export const JobsAPI = {
  /**
   * Find or create a job
   * @param {string} jobNumber - Job number
   * @param {string} filename - Optional filename
   * @returns {Promise} Job data
   */
  async upsert(jobNumber, filename = null) {
    const { data, error } = await supabaseClient
      .from('jobs')
      .upsert(
        { job_number: jobNumber, filename },
        { onConflict: 'job_number_norm' }
      )
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
  
  /**
   * Get all jobs
   * @returns {Promise} Array of jobs
   */
  async list() {
    const { data, error } = await supabaseClient
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },
  
  /**
   * Search jobs by number
   * @param {string} query - Search query
   * @returns {Promise} Array of matching jobs
   */
  async search(query) {
    if (!query) return [];
    
    const normalized = normalizeCode(query);
    
    const { data, error } = await supabaseClient
      .from('jobs')
      .select('*')
      .ilike('job_number_norm', `%${normalized}%`)
      .limit(10)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },
  
  /**
   * Get job with stats
   * @param {string} jobId - Job ID
   * @returns {Promise} Job with part and location counts
   */
  async getWithStats(jobId) {
    const { data: job, error: jobError } = await supabaseClient
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (jobError) throw jobError;
    
    // Get part count
    const { count: partCount } = await supabaseClient
      .from('parts')
      .select('*', { count: 'exact', head: true })
      .eq('job_id', jobId);
    
    // Get location count
    const { data: parts } = await supabaseClient
      .from('parts')
      .select('id')
      .eq('job_id', jobId);
    
    let locationCount = 0;
    if (parts && parts.length > 0) {
      const { count } = await supabaseClient
        .from('part_locations')
        .select('*', { count: 'exact', head: true })
        .in('part_id', parts.map(p => p.id));
      locationCount = count || 0;
    }
    
    return {
      ...job,
      part_count: partCount || 0,
      location_count: locationCount,
    };
  },
  
  /**
   * Delete job and all related data
   * @param {string} jobId - Job ID
   * @returns {Promise}
   */
  async delete(jobId) {
    const { error } = await supabaseClient
      .from('jobs')
      .delete()
      .eq('id', jobId);
    
    if (error) throw error;
  },
};

/**
 * Parts Operations
 */
export const PartsAPI = {
  /**
   * Upsert a part
   * @param {string} jobId - Job ID
   * @param {string} partNumber - Part number
   * @param {string} description - Optional description
   * @returns {Promise} Part data
   */
  async upsert(jobId, partNumber, description = null) {
    const { data, error } = await supabaseClient
      .from('parts')
      .upsert(
        { job_id: jobId, part_number: partNumber, description },
        { onConflict: 'job_id,part_number_norm' }
      )
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
  
  /**
   * Get parts for a job with locations
   * @param {string} jobId - Job ID
   * @returns {Promise} Array of parts with locations
   */
  async getWithLocations(jobId) {
    const { data, error } = await supabaseClient
      .from('parts')
      .select(`
        *,
        part_locations (*)
      `)
      .eq('job_id', jobId)
      .order('part_number');
    
    if (error) throw error;
    return data || [];
  },
  
  /**
   * Search parts by number or description
   * @param {string} jobId - Job ID
   * @param {string} query - Search query
   * @returns {Promise} Array of matching parts
   */
  async search(jobId, query) {
    if (!query) return this.getWithLocations(jobId);
    
    const normalized = normalizeCode(query);
    
    const { data, error } = await supabaseClient
      .from('parts')
      .select(`
        *,
        part_locations (*)
      `)
      .eq('job_id', jobId)
      .or(`part_number_norm.ilike.%${normalized}%,description.ilike.%${query}%`)
      .limit(50)
      .order('part_number');
    
    if (error) throw error;
    return data || [];
  },
  
  /**
   * Delete all parts for a job
   * @param {string} jobId - Job ID
   * @returns {Promise}
   */
  async deleteByJob(jobId) {
    const { error } = await supabaseClient
      .from('parts')
      .delete()
      .eq('job_id', jobId);
    
    if (error) throw error;
  },
};

/**
 * Part Locations Operations
 */
export const LocationsAPI = {
  /**
   * Upsert a location
   * @param {string} partId - Part ID
   * @param {string} location - Location
   * @param {number} qtyRequired - Required quantity
   * @param {boolean} replaceQty - Replace quantity instead of adding
   * @returns {Promise} Location data
   */
  async upsert(partId, location, qtyRequired, replaceQty = false) {
    // First, try to get existing location
    const normalized = normalizeCode(location);
    const { data: existing } = await supabaseClient
      .from('part_locations')
      .select('*')
      .eq('part_id', partId)
      .eq('location_norm', normalized)
      .single();
    
    if (existing) {
      // Update existing
      const newQty = replaceQty ? qtyRequired : existing.qty_required + qtyRequired;
      const { data, error } = await supabaseClient
        .from('part_locations')
        .update({ qty_required: newQty })
        .eq('id', existing.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      // Insert new
      const { data, error } = await supabaseClient
        .from('part_locations')
        .insert({
          part_id: partId,
          location,
          qty_required: qtyRequired,
          qty_assigned: 0,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    }
  },
  
  /**
   * Update assigned quantity
   * @param {string} locationId - Location ID
   * @param {number} delta - Change in quantity (can be negative)
   * @returns {Promise} Updated location data
   */
  async updateAssigned(locationId, delta) {
    // Get current location
    const { data: current, error: getError } = await supabaseClient
      .from('part_locations')
      .select('*')
      .eq('id', locationId)
      .single();
    
    if (getError) throw getError;
    
    // Calculate new assigned quantity (bounded 0 to required)
    const newAssigned = Math.max(0, Math.min(
      current.qty_required,
      current.qty_assigned + delta
    ));
    
    // Update
    const { data, error } = await supabaseClient
      .from('part_locations')
      .update({ qty_assigned: newAssigned })
      .eq('id', locationId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
  
  /**
   * Set assigned quantity
   * @param {string} locationId - Location ID
   * @param {number} quantity - New quantity
   * @returns {Promise} Updated location data
   */
  async setAssigned(locationId, quantity) {
    const { data: current, error: getError } = await supabaseClient
      .from('part_locations')
      .select('qty_required')
      .eq('id', locationId)
      .single();
    
    if (getError) throw getError;
    
    // Bound the quantity
    const bounded = Math.max(0, Math.min(current.qty_required, quantity));
    
    const { data, error } = await supabaseClient
      .from('part_locations')
      .update({ qty_assigned: bounded })
      .eq('id', locationId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
  
  /**
   * Get all unique locations for a job
   * @param {string} jobId - Job ID
   * @returns {Promise} Array of unique locations
   */
  async getUniqueForJob(jobId) {
    const { data: parts } = await supabaseClient
      .from('parts')
      .select('id')
      .eq('job_id', jobId);
    
    if (!parts || parts.length === 0) return [];
    
    const { data, error } = await supabaseClient
      .from('part_locations')
      .select('location')
      .in('part_id', parts.map(p => p.id))
      .order('location');
    
    if (error) throw error;
    
    // Deduplicate
    const unique = [...new Set(data.map(d => d.location))];
    return unique;
  },
  
  /**
   * Delete all locations for parts in a job
   * @param {string} jobId - Job ID
   * @returns {Promise}
   */
  async deleteByJob(jobId) {
    // Get part IDs
    const { data: parts } = await supabaseClient
      .from('parts')
      .select('id')
      .eq('job_id', jobId);
    
    if (!parts || parts.length === 0) return;
    
    // Delete locations
    const { error } = await supabaseClient
      .from('part_locations')
      .delete()
      .in('part_id', parts.map(p => p.id));
    
    if (error) throw error;
  },
};

/**
 * Import Operations
 */
export const ImportsAPI = {
  /**
   * Create import record
   * @param {string} jobId - Job ID
   * @param {string} strategy - Import strategy (merge/replace)
   * @param {string} storagePath - Storage path for the file
   * @returns {Promise} Import data
   */
  async create(jobId, strategy, storagePath) {
    const { data, error } = await supabaseClient
      .from('imports')
      .insert({
        job_id: jobId,
        strategy,
        storage_path: storagePath,
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
  
  /**
   * Save import items for auditing
   * @param {string} importId - Import ID
   * @param {Array} items - Array of import items
   * @returns {Promise}
   */
  async saveItems(importId, items) {
    // Chunk for batch insert
    const chunks = chunk(items, APP_CONFIG.BATCH_SIZE);
    
    for (const batch of chunks) {
      const { error } = await supabaseClient
        .from('import_items')
        .insert(batch.map(item => ({
          import_id: importId,
          part_number_raw: item.partNumber,
          location_raw: item.location,
          qty_raw: item.quantity,
          description_raw: item.description,
        })));
      
      if (error) throw error;
    }
  },
  
  /**
   * Execute import with strategy
   * @param {object} params - Import parameters
   * @returns {Promise} Import results
   */
  async executeImport({ jobId, strategy, items, replaceQtyOnMerge, progressCallback }) {
    const results = {
      partsCreated: 0,
      partsUpdated: 0,
      locationsCreated: 0,
      locationsUpdated: 0,
      deleted: 0,
      errors: [],
    };
    
    try {
      // Replace strategy: delete existing first
      if (strategy === 'replace') {
        if (progressCallback) progressCallback('Deleting existing data...');
        
        await LocationsAPI.deleteByJob(jobId);
        await PartsAPI.deleteByJob(jobId);
        
        const { count } = await supabaseClient
          .from('parts')
          .select('*', { count: 'exact', head: true })
          .eq('job_id', jobId);
        
        results.deleted = count || 0;
      }
      
      // Process items in chunks
      const chunks = chunk(items, 100);
      let processed = 0;
      
      for (const batch of chunks) {
        for (const item of batch) {
          try {
            // Upsert part
            const partBefore = await supabaseClient
              .from('parts')
              .select('id')
              .eq('job_id', jobId)
              .eq('part_number_norm', normalizeCode(item.partNumber))
              .single();
            
            const part = await PartsAPI.upsert(
              jobId,
              item.partNumber,
              item.description
            );
            
            if (partBefore.data) {
              results.partsUpdated++;
            } else {
              results.partsCreated++;
            }
            
            // Upsert location
            const locBefore = await supabaseClient
              .from('part_locations')
              .select('id')
              .eq('part_id', part.id)
              .eq('location_norm', normalizeCode(item.location))
              .single();
            
            await LocationsAPI.upsert(
              part.id,
              item.location,
              item.quantity || 1,
              strategy === 'replace' || replaceQtyOnMerge
            );
            
            if (locBefore.data) {
              results.locationsUpdated++;
            } else {
              results.locationsCreated++;
            }
            
          } catch (error) {
            console.error('Error processing item:', item, error);
            results.errors.push({
              item,
              error: error.message,
            });
          }
        }
        
        processed += batch.length;
        if (progressCallback) {
          const percent = Math.round((processed / items.length) * 100);
          progressCallback(`Processing... ${percent}%`);
        }
      }
      
    } catch (error) {
      console.error('Import error:', error);
      throw error;
    }
    
    return results;
  },
};

/**
 * Storage Operations
 */
export const StorageAPI = {
  /**
   * Upload file to storage
   * @param {string} path - Storage path
   * @param {File} file - File to upload
   * @returns {Promise} Upload data
   */
  async upload(path, file) {
    const { data, error } = await supabaseClient.storage
      .from(APP_CONFIG.STORAGE_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
    
    if (error) throw error;
    return data;
  },
  
  /**
   * List files in a path
   * @param {string} path - Storage path
   * @returns {Promise} Array of files
   */
  async list(path) {
    const { data, error } = await supabaseClient.storage
      .from(APP_CONFIG.STORAGE_BUCKET)
      .list(path, {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' },
      });
    
    if (error) throw error;
    return data || [];
  },
  
  /**
   * Delete file
   * @param {string} path - File path
   * @returns {Promise}
   */
  async delete(path) {
    const { error } = await supabaseClient.storage
      .from(APP_CONFIG.STORAGE_BUCKET)
      .remove([path]);
    
    if (error) throw error;
  },
  
  /**
   * Delete all files in a path
   * @param {string} path - Directory path
   * @returns {Promise}
   */
  async deleteAll(path) {
    const files = await this.list(path);
    
    if (files.length === 0) return;
    
    const paths = files.map(f => `${path}/${f.name}`);
    
    const { error } = await supabaseClient.storage
      .from(APP_CONFIG.STORAGE_BUCKET)
      .remove(paths);
    
    if (error) throw error;
  },
  
  /**
   * Get public URL for a file
   * @param {string} path - File path
   * @returns {string} Public URL
   */
  getPublicUrl(path) {
    const { data } = supabaseClient.storage
      .from(APP_CONFIG.STORAGE_BUCKET)
      .getPublicUrl(path);
    
    return data.publicUrl;
  },
};

// Export all APIs
export default {
  supabaseClient,
  JobsAPI,
  PartsAPI,
  LocationsAPI,
  ImportsAPI,
  StorageAPI,
};