

class Solution
{
    //Function to return the minimum cost to react at bottom
	//right cell from top left cell.
    public int minimumCostPath(int[][] grid)
    {
       int m=grid.length;
       int n=grid[0].length;
       int[]prev = new int[n];
       int[]curr = new int[n];
       for(int i=0;i<m;i++){
           for(int j=0;j<n;j++){
               if(i==0 && j==0){
                   curr[j]=grid[i][j];
               }
               else {
                   int up=grid[i][j];
                   int left=grid[i][j];
                   if(i>0){
                     up+= prev[j];
                   }
                   else
                   {
                       up=(int)1e9;
                   }
                   if(j>0){
                     left+= curr[j-1];
                   }
                   else
                   {
                       left=(int)1e9;
                   }
                   curr[j]=Math.min(up,left);
                   
               }
           }
           prev=curr;
       }
       return prev[n-1];
    }
  
}