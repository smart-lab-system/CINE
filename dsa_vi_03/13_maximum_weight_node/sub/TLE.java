

// User function Template for Java

class Solution {
    public int maxWeightCell(int[] exits) {
        
        int n = exits.length;
        int ind[] = new int[n];
        for(int i=0;i<n;i++){
            ind[i] = i;
        }
        int weight[] = new int[n];
        for(int i=0;i<n;i++){
            int sum=0;
            for(int j=0;j<n;j++){
                if(ind[i] == exits[j]){
                    sum += j;
                }
            }
            weight[i] = sum;
        }
        for(int i=0;i<n;i++){
            for(int j=i+1;j<n;j++){
                
                if(weight[i]>weight[j]){
                    int min = weight[i];
                    int k = ind[i];
                    weight[i] = weight[j];
                    ind[i] = ind[j];
                    weight[j] = min;
                    ind[j] = k;
                }
            }
        }
        return ind[n-1];
    }
}