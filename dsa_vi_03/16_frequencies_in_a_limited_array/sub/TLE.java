

class Solution {
    // Function to count the frequency of all elements from 1 to N in the array.
    public List<Integer> frequencyCount(int[] arr) {
        // do modify in the given array
        int n = arr.length;
        boolean[] visited = new boolean[n];
        Integer[] result = new Integer[n];
        Arrays.fill(result, 0);
        for(int i=0; i<n; i++) {
            if(visited[i] == true) {
                continue;
            }
            int count = 1;
            for(int j=i+1; j<n; j++) {
                if(arr[i] == arr[j]) {
                    count++;
                    visited[j] = true;
                }
            }
            result[arr[i]-1] = count;
        }
        
        return Arrays.asList(result);
    }
}