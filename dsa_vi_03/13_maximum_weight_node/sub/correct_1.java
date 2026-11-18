

// User function Template for Java

class Solution {
    public int maxWeightCell(int[] exits) {
        
        
        
          int n = exits.length;
        // initialize an array to store the weights
        long weight[] = new long[n];

        // calculate the weights of each cell based on the given edges
        for (int i = 0; i < n; i++) {
            if (exits[i] != -1) {
                weight[exits[i]] += i;
            }
        }

        // initialize an array to store the maximum weight and its corresponding cell
        // index
        long ans[] = {-1, -1};

        // find the cell with the maximum weight
        for (int i = 0; i < n; i++) {
            if (weight[i] >= ans[0]) ans = new long[] {weight[i], i};
        }

        // return the index of the cell with the maximum weight
        return (int)ans[1];
    }
}