



class Solution {
    public static  double mergeof2( int a[] , int b[])
    {
         int merge[] = new int[a.length+b.length];
         int k = 0 ;
         
         for( int i = 0 ; i < a.length ;i++)
         {
             merge[k++] = a[i];
             
         }
         
           for( int j = 0 ; j < b.length ;j++)
         {
             merge[k++] = b[j];
             
             
         }
         
         int n = merge.length ;
         int mid = n/2 ;
         
           if( n/2 == 1)
           {
               //odd
               return merge[mid] ;
           }
           else 
           {
               return (merge[mid] + merge[mid-1]) / 2.0 ;
           }
    }
}