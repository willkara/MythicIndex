<script lang="ts">
    import { enhance } from '$app/forms';
    import type { SubmitFunction } from './$types';

    let uploading = $state(false);
    let message = $state('');

    const handleSubmit: SubmitFunction = () => {
        uploading = true;
        message = 'Uploading...';
        return async ({ result, update }) => {
            uploading = false;
            if (result.type === 'success') {
                message = 'Upload successful!';
            } else if (result.type === 'failure') {
                message = 'Upload failed: ' + (result.data?.message || 'Unknown error');
            }
            await update();
        };
    };
</script>

<div class="container mx-auto p-4 max-w-lg">
    <h1 class="text-3xl font-bold mb-6">Content Upload</h1>

    <div class="p-6 bg-white rounded-lg border border-gray-200 shadow-md dark:bg-gray-800 dark:border-gray-700">
        <form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance={handleSubmit} class="space-y-4">
            <div>
                <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white" for="file_input">Upload Markdown File</label>
                <input class="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400" id="file_input" name="file" type="file" accept=".md" required>
            </div>

            <div>
                 <label for="type_select" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Content Type</label>
                 <select id="type_select" name="type" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
                    <option value="CHAPTER">Chapter</option>
                    <option value="CHARACTER">Character</option>
                    <option value="LOCATION">Location</option>
                  </select>
            </div>

            <button type="submit" disabled={uploading} class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800 disabled:opacity-50">
                {uploading ? 'Uploading...' : 'Upload'}
            </button>
        </form>
        {#if message}
            <div class="mt-4 p-4 text-sm text-gray-800 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-300" role="alert">
                {message}
            </div>
        {/if}
    </div>
</div>
