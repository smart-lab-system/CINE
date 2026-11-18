

// User function Template for Java

class Solution {

    static Boolean isSubsetSum(int arr[], int target) {
        int[][] d = new int[201][40001];
        for (int i=0; i<201; i++) {
            for (int j=0; j<40001; j++) d[i][j] = Integer.MAX_VALUE;
        }
        return find(arr, arr.length-1, target, d);
    }
    
    static Boolean find(int[] a, int i, int t, int[][] d) {
        if (t == 0) return true;
        if (i == 0) return a[i] == t;
        if (d[i][t] != Integer.MAX_VALUE) return d[i][t] == 1;
        
        boolean y = false;
        if (t >= a[i]) y = find(a, i-1, t-a[i], d);
        boolean n = find(a, i-1, t, d);
        d[i][t] = y || n ? 1 : 0;
        
        return y || n;
    }
}