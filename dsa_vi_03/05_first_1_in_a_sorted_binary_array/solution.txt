// User function Template for Java

class Solution {

    public long firstIndex(int arr[]) {
        // Your code goes here
        int low = 0;
        int high = arr.length - 1;
        
        while (low <= high) {
            int mid = low + ((high - low) >> 1);
            if (arr[mid] == 1) high = mid - 1;
            else low = mid + 1;
        }
        
        if (low == arr.length) return -1;
        return low;
    }
}